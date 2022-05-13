import React, { useState, useEffect, useContext, useCallback } from 'react';
import { metadata, studies, utils, log } from '@ohif/core';
import usePrevious from '../customHooks/usePrevious';

import ConnectedViewer from './ConnectedViewer.js';
import PropTypes from 'prop-types';
import { extensionManager } from './../App.js';
import { useSnackbarContext, ErrorPage } from '@ohif/ui';

// Contexts
import AppContext from '../context/AppContext';
import NotFound from '../routes/NotFound';

const { OHIFStudyMetadata, OHIFSeriesMetadata } = metadata;
const { retrieveStudiesMetadata } = studies;
const { studyMetadataManager } = utils;

const _promoteToFront = (list, values, searchMethod) => {
  let listCopy = [...list];
  let response = [];
  let promotedCount = 0;

  const arrayValues = values.split(',');
  arrayValues.forEach(value => {
    const index = listCopy.findIndex(searchMethod.bind(undefined, value));

    if (index >= 0) {
      const [itemToPromote] = listCopy.splice(index, 1);
      response[promotedCount] = itemToPromote;
      promotedCount++;
    }
  });

  return {
    promoted: promotedCount === arrayValues.length,
    data: [...response, ...listCopy],
  };
};

/**
 * Promote series to front if find found equivalent on filters object
 * @param {Object} study - study reference to promote series against
 * @param {Object} [filters] - Object containing filters to be applied
 * @param {string} [filter.seriesInstanceUID] - series instance uid to filter results against
 * @param {boolean} isFilterStrategy - if filtering by query param strategy ON
 */
const _promoteList = (study, studyMetadata, filters, isFilterStrategy) => {
  let promoted = false;
  // Promote only if no filter should be applied
  if (!isFilterStrategy) {
    promoted = _promoteStudyDisplaySet(study, studyMetadata, filters);
  }

  return promoted;
};

const _promoteStudyDisplaySet = (study, studyMetadata, filters) => {
  let promoted = false;
  const queryParamsLength = Object.keys(filters).length;
  const shouldPromoteToFront = queryParamsLength > 0;

  if (shouldPromoteToFront) {
    const { seriesInstanceUID } = filters;

    const _seriesLookup = (valueToCompare, displaySet) => {
      return displaySet.SeriesInstanceUID === valueToCompare;
    };
    const promotedResponse = _promoteToFront(
      studyMetadata.getDisplaySets(),
      seriesInstanceUID,
      _seriesLookup
    );

    study.displaySets = promotedResponse.data;
    promoted = promotedResponse.promoted;
  }

  return promoted;
};

/**
 * Method to identify if query param (from url) was applied to given list
 * @param {Object} study - study reference to promote series against
 * @param {Object} [filters] - Object containing filters to be applied
 * @param {string} [filter.seriesInstanceUID] - series instance uid to filter results against
 * @param {boolean} isFilterStrategy - if filtering by query param strategy ON
 */
const _isQueryParamApplied = (study, filters = {}, isFilterStrategy) => {
  const { seriesInstanceUID } = filters;
  let applied = true;
  // skip in case no filter or no toast manager

  if (!seriesInstanceUID) {
    return applied;
  }
  const seriesInstanceUIDs = seriesInstanceUID.split(',');

  let validateFilterApplied = () => {
    const sameSize = arrayToInspect.length === seriesInstanceUIDs.length;
    if (!sameSize) {
      return;
    }

    return arrayToInspect.every(item =>
      seriesInstanceUIDs.some(
        seriesInstanceUIDStr => seriesInstanceUIDStr === item.SeriesInstanceUID
      )
    );
  };

  let validatePromoteApplied = () => {
    let isValid = true;
    for (let index = 0; index < seriesInstanceUIDs.length; index++) {
      const seriesInstanceUIDStr = seriesInstanceUIDs[index];
      const resultSeries = arrayToInspect[index];

      if (
        !resultSeries ||
        resultSeries.SeriesInstanceUID !== seriesInstanceUIDStr
      ) {
        isValid = false;
        break;
      }
    }
    return isValid;
  };

  const { series = [], displaySets = [] } = study;
  const arrayToInspect = isFilterStrategy ? series : displaySets;
  const validateMethod = isFilterStrategy
    ? validateFilterApplied
    : validatePromoteApplied;

  if (!arrayToInspect) {
    applied = false;
  } else {
    applied = validateMethod();
  }

  return applied;
};
const _showUserMessage = (queryParamApplied, message, dialog = {}) => {
  if (queryParamApplied) {
    return;
  }

  const { show: showUserMessage = () => {} } = dialog;
  showUserMessage({
    message,
  });
};

const _addSeriesToStudy = (studyMetadata, series) => {
  const sopClassHandlerModules =
    extensionManager.modules['sopClassHandlerModule'];
  const study = studyMetadata.getData();
  const seriesMetadata = new OHIFSeriesMetadata(series, study);
  const existingSeries = studyMetadata.getSeriesByUID(series.SeriesInstanceUID);
  if (existingSeries) {
    studyMetadata.updateSeries(series.SeriesInstanceUID, seriesMetadata);
  } else {
    studyMetadata.addSeries(seriesMetadata);
  }

  studyMetadata.createAndAddDisplaySetsForSeries(
    sopClassHandlerModules,
    seriesMetadata
  );

  study.displaySets = studyMetadata.getDisplaySets();
  study.derivedDisplaySets = studyMetadata.getDerivedDatasets({
    Modality: series.Modality,
  });
};

const _updateStudyMetadataManager = (study, studyMetadata) => {
  const { StudyInstanceUID } = study;

  if (!studyMetadataManager.get(StudyInstanceUID)) {
    studyMetadataManager.add(studyMetadata);
  }

  if (study.derivedDisplaySets) {
    studyMetadata._addDerivedDisplaySets(study.derivedDisplaySets);
  }
};

const _thinStudyData = study => {
  return {
    StudyInstanceUID: study.StudyInstanceUID,
    series: study.series.map(item => ({
      SeriesInstanceUID: item.SeriesInstanceUID,
    })),
  };
};

function ViewerRetrieveStudyData({
  servers,
  studyInstanceUIDs,
  seriesInstanceUIDs,
  clearViewportSpecificData,
  setStudyData,
}) {
  // hooks
  const [error, setError] = useState(false);
  const [studies, setStudies] = useState([]);
  const [isStudyLoaded, setIsStudyLoaded] = useState(false);
  const snackbarContext = useSnackbarContext();
  const { appConfig = {} } = useContext(AppContext);
  const {
    filterQueryParam: isFilterStrategy = false,
    maxConcurrentMetadataRequests,
  } = appConfig;

  /**
   * Callback method when study is totally loaded
   * @param {object} study study loaded
   * @param {object} studyMetadata studyMetadata for given study
   * @param {Object} [filters] - Object containing filters to be applied
   * @param {string} [filter.seriesInstanceUID] - series instance uid to filter results against
   */
  const studyDidLoad = (study, studyMetadata, filters) => {
    // User message
    const promoted = _promoteList(
      study,
      studyMetadata,
      filters,
      isFilterStrategy
    );

    // Clear viewport to allow new promoted one to be displayed
    if (promoted) {
      clearViewportSpecificData(0);
    }

    const isQueryParamApplied = _isQueryParamApplied(
      study,
      filters,
      isFilterStrategy
    );
    // Show message in case not promoted neither filtered but should to
    _showUserMessage(
      isQueryParamApplied,
      'Query parameters were not totally applied. It might be using original series list for given study.',
      snackbarContext
    );
  };

  /**
   * Method to process studies. It will update displaySet, studyMetadata, load remaining series, ...
   * @param {Array} studiesData Array of studies retrieved from server, each study is an array (each element is a server)
   * @param {Object} [filters] - Object containing filters to be applied
   * @param {string} [filters.seriesInstanceUID] - series instance uid to filter results against
   */
  const processStudies = async (studiesData, filters) => {
    studiesData = [].concat(...studiesData);
    if (Array.isArray(studiesData) && studiesData.length > 0) {
      // Map studies to new format, update metadata manager?
      const studiesLoading = await Promise.all(
        await studiesData.map(async study => {
          const studyMetadata = new OHIFStudyMetadata(
            study,
            study.StudyInstanceUID
          );

          // Attempt to load remaning series if any
          try {
            await loadRemainingSeries(studyMetadata);
          } catch (error) {
            if (error) {
              setError(error);
              log.error(error);
            }
          }

          return study;
        })
      );

      // for one StudyUID we could have N study object at this point (for N server).
      // we merge them in 1 unique study, since OHIF-v2 assume only one object for each StudyUID.
      // duplicate series will be removed.
      let mergedStudies = [];
      for (let i = 0; i < studiesLoading.length; i++) {
        const study = studiesLoading[i];
        const studyMetadata = new OHIFStudyMetadata(
          study,
          study.StudyInstanceUID
        );

        study.series.forEach(series => {
          _addSeriesToStudy(studyMetadata, series);
        });

        if (mergedStudies.length !== 0) {
          const found = mergedStudies.find(
            mergedStudy =>
              mergedStudy.StudyInstanceUID === study.StudyInstanceUID
          );

          if (found !== -1) {
            continue;
          }
        }

        for (let j = 0; j < studiesLoading.length; j++) {
          if (i === j) {
            continue;
          }

          const comparedStudy = studiesLoading[j];
          if (study.StudyInstanceUID !== comparedStudy.StudyInstanceUID) {
            continue;
          }

          if (comparedStudy.series && comparedStudy.series.length !== 0) {
            comparedStudy.series.forEach(series => {
              if (study.series.length !== 0) {
                const found = study.series.find(
                  studySeries =>
                    studySeries.SeriesInstanceUID === series.SeriesInstanceUID
                );
                if (found) {
                  return;
                }
              }

              study.series.push(series);
              _addSeriesToStudy(studyMetadata, series);
            });
          }

          if (
            comparedStudy.derivedDisplaySets &&
            comparedStudy.derivedDisplaySets.length !== 0
          ) {
            comparedStudy.derivedDisplaySets.forEach(derivedDisplaySet => {
              if (study.derivedDisplaySets.length !== 0) {
                const found = study.derivedDisplaySets.find(
                  studyDerivedDisplaySet =>
                    studyDerivedDisplaySet.SeriesInstanceUID ===
                    derivedDisplaySet.SeriesInstanceUID
                );
                if (found) {
                  return;
                }
              }

              study.derivedDisplaySets.push(derivedDisplaySet);
            });
          }

          if (
            comparedStudy.displaySets &&
            comparedStudy.displaySets.length !== 0
          ) {
            comparedStudy.displaySets.forEach(displaySet => {
              if (study.displaySets.length !== 0) {
                const found = study.displaySets.find(
                  studyDisplaySet =>
                    studyDisplaySet.SeriesInstanceUID ===
                    displaySet.SeriesInstanceUID
                );
                if (found) {
                  return;
                }
              }

              study.displaySets.push(displaySet);
            });
          }

          if (comparedStudy.seriesMap) {
            for (let key in comparedStudy.seriesMap) {
              for (let prop in study.seriesMap) {
                if (prop === key) {
                  continue;
                }
              }

              study.seriesMap[key] = comparedStudy.seriesMap[key];
            }
          }
        }

        study.displaySets.forEach(displaySet => {
          studyMetadata.addDisplaySet(displaySet);
        });

        _updateStudyMetadataManager(study, studyMetadata);
        setStudyData(study.StudyInstanceUID, _thinStudyData(study));
        studyDidLoad(study, studyMetadata, filters);
        mergedStudies.push(study);
      }

      setStudies(mergedStudies);
    }
  };

  const forceRerender = () => setStudies(studies => [...studies]);

  const loadRemainingSeries = async studyMetadata => {
    const { seriesLoader } = studyMetadata.getData();
    if (!seriesLoader) return;

    const loadNextSeries = async () => {
      if (!seriesLoader.hasNext()) return;
      const series = await seriesLoader.next();
      _addSeriesToStudy(studyMetadata, series);
      forceRerender();
      return loadNextSeries();
    };

    const concurrentRequestsAllowed =
      maxConcurrentMetadataRequests || studyMetadata.getSeriesCount();
    const promises = Array(concurrentRequestsAllowed)
      .fill(null)
      .map(loadNextSeries);
    const remainingPromises = await Promise.all(promises);
    setIsStudyLoaded(true);
    return remainingPromises;
  };

  const loadStudies = async () => {
    try {
      const filters = {};
      // Use the first, discard others
      const seriesInstanceUID = seriesInstanceUIDs && seriesInstanceUIDs[0];
      const retrieveParams = [servers, studyInstanceUIDs];

      if (seriesInstanceUID) {
        filters.seriesInstanceUID = seriesInstanceUID;
        // Query param filtering controlled by appConfig property
        if (isFilterStrategy) {
          retrieveParams.push(filters);
        }
      }

      if (
        appConfig.splitQueryParameterCalls ||
        appConfig.enableGoogleCloudAdapter
      ) {
        retrieveParams.push(true); // Seperate SeriesInstanceUID filter calls.
      }

      try {
        const result = await retrieveStudiesMetadata(...retrieveParams);
        await processStudies(result, filters);
        setIsStudyLoaded(true);
      } catch (error) {
        if (error) {
          setError(error);
          log.error(error);
        }
      }
    } catch (error) {
      if (error) {
        setError(error);
        log.error(error);
      }
    }
  };

  const prevStudyInstanceUIDs = usePrevious(studyInstanceUIDs);

  useEffect(() => {
    const hasStudyInstanceUIDsChanged = !(
      prevStudyInstanceUIDs &&
      prevStudyInstanceUIDs.every(e => studyInstanceUIDs.includes(e))
    );

    if (hasStudyInstanceUIDsChanged) {
      studyMetadataManager.purge();
    }
  }, [prevStudyInstanceUIDs, studyInstanceUIDs]);

  useEffect(() => {
    loadStudies();

    return () => {};
  }, []);

  if (error) {
    const content = JSON.stringify(error);
    if (content.includes('404') || content.includes('NOT_FOUND')) {
      return <NotFound />;
    }

    return <NotFound message="Failed to retrieve study data" />;
  }

  return (
    <ConnectedViewer
      studies={studies}
      isStudyLoaded={isStudyLoaded}
      studyInstanceUIDs={studyInstanceUIDs}
    />
  );
}

ViewerRetrieveStudyData.propTypes = {
  studyInstanceUIDs: PropTypes.array.isRequired,
  seriesInstanceUIDs: PropTypes.array,
  servers: PropTypes.object,
  clearViewportSpecificData: PropTypes.func.isRequired,
  setStudyData: PropTypes.func.isRequired,
};

export default ViewerRetrieveStudyData;
