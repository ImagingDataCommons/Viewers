import React, { useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Machine } from 'xstate';
import { useMachine } from '@xstate/react';
import { useViewportGrid } from '@ohif/ui';
import {
  machineConfiguration,
  defaultOptions,
} from './measurementTrackingMachine';
import promptBeginTracking from './promptBeginTracking';
import promptTrackNewSeries from './promptTrackNewSeries';
import promptTrackNewStudy from './promptTrackNewStudy';
import promptSaveReport from './promptSaveReport';
import promptHydrateStructuredReport from './promptHydrateStructuredReport';
import hydrateStructuredReport from './hydrateStructuredReport';

const TrackedMeasurementsContext = React.createContext();
TrackedMeasurementsContext.displayName = 'TrackedMeasurementsContext';
const useTrackedMeasurements = () => useContext(TrackedMeasurementsContext);

const SR_SOPCLASSHANDLERID =
  '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr';

/**
 *
 * @param {*} param0
 */
function TrackedMeasurementsContextProvider(
  { servicesManager, commandsManager, extensionManager, appConfig }, // Bound by consumer
  { children } // Component props
) {
  const [viewportGrid, viewportGridService] = useViewportGrid();
  const { activeViewportIndex, viewports } = viewportGrid;
  const { measurementService, displaySetService } = servicesManager.services;

  const machineOptions = Object.assign({}, defaultOptions);
  machineOptions.actions = Object.assign({}, machineOptions.actions, {
    jumpToFirstMeasurementInActiveViewport: (ctx, evt) => {
      const { trackedStudy, trackedSeries } = ctx;
      const measurements = measurementService.getMeasurements();
      const trackedMeasurements = measurements.filter(
        m =>
          trackedStudy === m.referenceStudyUID &&
          trackedSeries.includes(m.referenceSeriesUID)
      );

      console.log(
        'jumping to measurement reset viewport',
        viewportGrid.activeViewportIndex,
        trackedMeasurements[0]
      );

      const referencedDisplaySetUID =
        trackedMeasurements[0].displaySetInstanceUID;
      const referencedDisplaySet = displaySetService.getDisplaySetByUID(
        referencedDisplaySetUID
      );

      const referencedImages = referencedDisplaySet.images;
      const isVolumeIdReferenced = referencedImages[0].imageId.startsWith(
        'volumeId'
      );

      const measurementData = trackedMeasurements[0].data;

      let imageIndex = 0;
      if (!isVolumeIdReferenced && measurementData) {
        // if it is imageId referenced find the index of the imageId, we don't have
        // support for volumeId referenced images yet
        imageIndex = referencedImages.findIndex(image => {
          const imageIdToUse = Object.keys(measurementData)[0].substring(8);
          return image.imageId === imageIdToUse;
        });

        if (imageIndex === -1) {
          console.warn(
            'Could not find image index for tracked measurement, using 0'
          );
          imageIndex = 0;
        }
      }

      viewportGridService.setDisplaySetsForViewport({
        viewportIndex: viewportGrid.activeViewportIndex,
        displaySetInstanceUIDs: [referencedDisplaySetUID],
        viewportOptions: {
          initialImageOptions: {
            index: imageIndex,
          },
        },
      });
    },
    showStructuredReportDisplaySetInActiveViewport: (ctx, evt) => {
      if (evt.data.createdDisplaySetInstanceUIDs.length > 0) {
        const StructuredReportDisplaySetInstanceUID =
          evt.data.createdDisplaySetInstanceUIDs[0].displaySetInstanceUID;

        viewportGridService.setDisplaySetsForViewport({
          viewportIndex: evt.data.viewportIndex,
          displaySetInstanceUIDs: [StructuredReportDisplaySetInstanceUID],
        });
      }
    },
    discardPreviouslyTrackedMeasurements: (ctx, evt) => {
      const measurements = measurementService.getMeasurements();
      const filteredMeasurements = measurements.filter(ms =>
        ctx.prevTrackedSeries.includes(ms.referenceSeriesUID)
      );
      const measurementIds = filteredMeasurements.map(fm => fm.id);

      for (let i = 0; i < measurementIds.length; i++) {
        measurementService.remove(measurementIds[i]);
      }
    },
    clearAllMeasurements: (ctx, evt) => {
      const measurements = measurementService.getMeasurements();
      const measurementIds = measurements.map(fm => fm.uid);

      for (let i = 0; i < measurementIds.length; i++) {
        measurementService.remove(measurementIds[i]);
      }
    },
  });
  machineOptions.services = Object.assign({}, machineOptions.services, {
    promptBeginTracking: promptBeginTracking.bind(null, {
      servicesManager,
      extensionManager,
    }),
    promptTrackNewSeries: promptTrackNewSeries.bind(null, {
      servicesManager,
      extensionManager,
    }),
    promptTrackNewStudy: promptTrackNewStudy.bind(null, {
      servicesManager,
      extensionManager,
    }),
    promptSaveReport: promptSaveReport.bind(null, {
      servicesManager,
      commandsManager,
      extensionManager,
    }),
    promptHydrateStructuredReport: promptHydrateStructuredReport.bind(null, {
      servicesManager,
      extensionManager,
      appConfig,
    }),
    hydrateStructuredReport: hydrateStructuredReport.bind(null, {
      servicesManager,
      extensionManager,
    }),
  });

  // TODO: IMPROVE
  // - Add measurement_updated to cornerstone; debounced? (ext side, or consumption?)
  // - Friendlier transition/api in front of measurementTracking machine?
  // - Blocked: viewport overlay shouldn't clip when resized
  // TODO: PRIORITY
  // - Fix "ellipses" series description dynamic truncate length
  // - Fix viewport border resize
  // - created/destroyed hooks for extensions (cornerstone measurement subscriptions in it's `init`)

  const measurementTrackingMachine = Machine(
    machineConfiguration,
    machineOptions
  );

  const [
    trackedMeasurements,
    sendTrackedMeasurementsEvent,
    trackedMeasurementsService,
  ] = useMachine(measurementTrackingMachine);

  // ~~ Listen for changes to ViewportGrid for potential SRs hung in panes when idle
  useEffect(() => {
    if (viewports.length > 0) {
      const activeViewport = viewports[activeViewportIndex];

      if (!activeViewport || !activeViewport?.displaySetInstanceUIDs?.length) {
        return;
      }

      // Todo: Getting the first displaySetInstanceUID is wrong, but we don't have
      // tracking fusion viewports yet. This should change when we do.
      const { displaySetService } = servicesManager.services;
      const displaySet = displaySetService.getDisplaySetByUID(
        activeViewport.displaySetInstanceUIDs[0]
      );

      if (!displaySet) {
        return;
      }

      // If this is an SR produced by our SR SOPClassHandler,
      // and it hasn't been loaded yet, do that now so we
      // can check if it can be rehydrated or not.
      //
      // Note: This happens:
      // - If the viewport is not currently an OHIFCornerstoneSRViewport
      // - If the displaySet has never been hung
      //
      // Otherwise, the displaySet will be loaded by the useEffect handler
      // listening to displaySet changes inside OHIFCornerstoneSRViewport.
      // The issue here is that this handler in TrackedMeasurementsContext
      // ends up occurring before the Viewport is created, so the displaySet
      // is not loaded yet, and isRehydratable is undefined unless we call load().
      if (
        displaySet.SOPClassHandlerId === SR_SOPCLASSHANDLERID &&
        !displaySet.isLoaded &&
        displaySet.load
      ) {
        displaySet.load();
      }

      // Magic string
      // load function added by our sopClassHandler module
      if (
        displaySet.SOPClassHandlerId === SR_SOPCLASSHANDLERID &&
        displaySet.isRehydratable === true
      ) {
        console.log('sending event...', trackedMeasurements);
        sendTrackedMeasurementsEvent('PROMPT_HYDRATE_SR', {
          displaySetInstanceUID: displaySet.displaySetInstanceUID,
          SeriesInstanceUID: displaySet.SeriesInstanceUID,
          viewportIndex: activeViewportIndex,
        });
      }
    }
  }, [
    activeViewportIndex,
    sendTrackedMeasurementsEvent,
    servicesManager.services,
    viewports,
  ]);

  return (
    <TrackedMeasurementsContext.Provider
      value={[trackedMeasurements, sendTrackedMeasurementsEvent]}
    >
      {children}
    </TrackedMeasurementsContext.Provider>
  );
}

TrackedMeasurementsContextProvider.propTypes = {
  children: PropTypes.oneOf([PropTypes.func, PropTypes.node]),
  servicesManager: PropTypes.object.isRequired,
  commandsManager: PropTypes.object.isRequired,
  extensionManager: PropTypes.object.isRequired,
};

export {
  TrackedMeasurementsContext,
  TrackedMeasurementsContextProvider,
  useTrackedMeasurements,
};
