import RetrieveMetadataLoaderSync from './retrieveMetadataLoaderSync';
import RetrieveMetadataLoaderAsync from './retrieveMetadataLoaderAsync';

/**
 * Retrieve Study metadata from a DICOM server. If the server is configured to use lazy load, only the first series
 * will be loaded and the property "studyLoader" will be set to let consumer load remaining series as needed.
 *
 * @param {Array} servers array with server Objects with server configuration parameters
 * @param {string} StudyInstanceUID The Study Instance UID of the study which needs to be loaded
 * @param {Object} [filters] - Object containing filters to be applied on retrieve metadata process
 * @param {string} [filter.seriesInstanceUID] - series instance uid to filter results against
 * @returns {Array} A study descriptor object for each server
 */
async function RetrieveMetadata(servers, StudyInstanceUID, filters = {}) {
  return new Promise((resolve, reject) => {
    const studyMetadataPromises = servers.map(server => {
      const RetrieveMetadataLoader =
        server.enableStudyLazyLoad != false
          ? RetrieveMetadataLoaderAsync
          : RetrieveMetadataLoaderSync;

      const retrieveMetadataLoader = new RetrieveMetadataLoader(
        server,
        StudyInstanceUID,
        filters
      );
      const studyMetadataPromise = retrieveMetadataLoader.execLoad();
      return studyMetadataPromise;
    });

    Promise.all(studyMetadataPromises).then(results => {
      resolve(results);
    }, reject);
  });
}

export default RetrieveMetadata;
