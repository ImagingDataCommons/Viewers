import OHIF from '@ohif/core';
import { connect } from 'react-redux';
import findDisplaySetByUID from './findDisplaySetByUID';
import { servicesManager } from './../App.js';
import { StudyBrowser } from '../../../ui/src/components/studyBrowser/StudyBrowser';

const { setActiveViewportSpecificData } = OHIF.redux.actions;

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onThumbnailClick: displaySetInstanceUID => {
      let displaySet = findDisplaySetByUID(
        ownProps.studyMetadata,
        displaySetInstanceUID
      );

      if (displaySet.SRLabels && displaySet.SRLabels.length > 0) {
        let srWithMeasurements = 1;
        let prevUID = displaySet.SRLabels[0].SeriesInstanceUID;

        displaySet.SRLabels.forEach(SRLabel => {
          const currUID = SRLabel.SeriesInstanceUID;
          if (currUID !== prevUID) {
            srWithMeasurements = srWithMeasurements + 1;
            prevUID = currUID;
          }
        });

        const event = new CustomEvent('foundSRDisplaySets', {
          detail: { srWithMeasurements: srWithMeasurements },
        });
        document.dispatchEvent(event);
      }

      const { LoggerService, UINotificationService } = servicesManager.services;

      if (displaySet.isDerived) {
        const { Modality } = displaySet;
        if (Modality === 'SEG' && servicesManager) {
          const onDisplaySetLoadFailureHandler = error => {
            const message =
              error.message.includes('orthogonal') ||
              error.message.includes('oblique')
                ? 'The segmentation has been detected as non coplanar,\
                If you really think it is coplanar,\
                please adjust the tolerance in the segmentation panel settings (at your own peril!)'
                : error.message;

            LoggerService.error({ error, message });
            UINotificationService.show({
              title: 'DICOM Segmentation Loader',
              message,
              type: 'error',
              autoClose: false,
            });
          };

          const {
            referencedDisplaySet,
            activatedLabelmapPromise,
          } = displaySet.getSourceDisplaySet(
            ownProps.studyMetadata,
            true,
            onDisplaySetLoadFailureHandler
          );
          displaySet = referencedDisplaySet;

          activatedLabelmapPromise.then(activatedLabelmapIndex => {
            const selectionFired = new CustomEvent(
              'extensiondicomsegmentationsegselected',
              {
                detail: { activatedLabelmapIndex: activatedLabelmapIndex },
              }
            );
            const segThumbnailSelected = new CustomEvent('segseriesselected');
            document.dispatchEvent(selectionFired);
            document.dispatchEvent(segThumbnailSelected);
          });
        } else if (Modality !== 'SR') {
          displaySet = displaySet.getSourceDisplaySet(ownProps.studyMetadata);
        }

        if (!displaySet) {
          const error = new Error(
            `Referenced series for ${Modality} dataset not present.`
          );
          const message = `Referenced series for ${Modality} dataset not present.`;
          LoggerService.error({ error, message });
          UINotificationService.show({
            autoClose: false,
            title: 'Fail to load series',
            message,
            type: 'error',
          });
        }
      }

      if (!displaySet) {
        const error = new Error('Source data not present');
        const message = 'Source data not present';
        LoggerService.error({ error, message });
        UINotificationService.show({
          autoClose: false,
          title: 'Fail to load series',
          message,
          type: 'error',
        });
      }

      if (displaySet.isSOPClassUIDSupported === false) {
        const error = new Error('Modality not supported');
        const message = 'Modality not supported';
        LoggerService.error({ error, message });
        UINotificationService.show({
          autoClose: false,
          title: 'Fail to load series',
          message,
          type: 'error',
        });
      }

      dispatch(setActiveViewportSpecificData(displaySet));
    },
  };
};

const ConnectedStudyBrowser = connect(
  null,
  mapDispatchToProps
)(StudyBrowser);

export default ConnectedStudyBrowser;
