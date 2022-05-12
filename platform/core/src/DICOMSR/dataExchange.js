import log from '../log';
import studies from '../studies';
import utils from '../utils';
import {
  retrieveMeasurementFromSR,
  stowSRFromMeasurements,
} from './handleStructuredReport';
import findMostRecentStructuredReport from './utils/findMostRecentStructuredReport';

/**
 * Function to be registered into MeasurementAPI to retrieve measurements from DICOM Structured Reports
 *
 * @param {serverType} server
 * @param {object} external
 * @returns {Promise} Should resolve with OHIF measurementData object
 */
const retrieveMeasurements = (server, external = {}) => {
  log.info('[DICOMSR] retrieveMeasurements');

  if (!server || server.type !== 'dicomWeb') {
    log.error('[DICOMSR] DicomWeb server is required!');
    return Promise.reject({});
  }

  const serverUrl = server.wadoRoot;
  const studies = utils.studyMetadataManager.all();
  const latestSeries = findMostRecentStructuredReport(studies);

  if (!latestSeries) return Promise.resolve({});

  return retrieveMeasurementFromSR(latestSeries, studies, serverUrl, external);
};

/**
 *  Function to be registered into MeasurementAPI to store measurements into DICOM Structured Reports
 *
 * @param {Object} measurementData - OHIF measurementData object
 * @param {Object} filter
 * @param {serverType} server
 * @returns {Object} With message to be displayed on success
 */
const storeMeasurements = async (measurementData, filter, server) => {
  log.info('[DICOMSR] storeMeasurements');

  if (!server || server.type !== 'dicomWeb') {
    log.error('[DICOMSR] DicomWeb server is required!');
    return Promise.reject({});
  }

  const serverUrl = server.wadoRoot;
  const firstMeasurementKey = Object.keys(measurementData)[0];
  const firstMeasurement = measurementData[firstMeasurementKey][0];
  const StudyInstanceUID =
    firstMeasurement && firstMeasurement.StudyInstanceUID;

  try {
    await stowSRFromMeasurements(measurementData, serverUrl);
    if (StudyInstanceUID) {
      studies.deleteStudyMetadataPromise(StudyInstanceUID);
    }

    return {
      message: 'Measurements saved successfully',
    };
  } catch (error) {
    log.error(
      `[DICOMSR] Error while saving the measurements: ${error.message}`
    );
    throw new Error('Error while saving the measurements.');
  }
};

export { retrieveMeasurements, storeMeasurements };
