/**
 * Should find the most recent Structured Report metadata
 *
 * @param {Array} studies
 * @returns {Object} Series
 */
const findMostRecentStructuredReport = studies => {
  let mostRecentStructuredReport;

  studies.forEach(study => {
    const allData = study.getData ? study.getData() : [];
    const allSeries = allData.series;
    allSeries.forEach(series => {
      // Skip series that may not have instances yet
      // This can happen if we have retrieved just the initial
      // details about the series via QIDO-RS, but not the full metadata
      if (!series || !series.instances || series.instances.length === 0) {
        return;
      }

      if (isStructuredReportSeries(series)) {
        if (
          !mostRecentStructuredReport ||
          compareSeriesDate(series, mostRecentStructuredReport)
        ) {
          mostRecentStructuredReport = series;
        }
      }
    });
  });

  return mostRecentStructuredReport;
};

/**
 *  Checks if series sopClassUID matches with the supported Structured Reports sopClassUID
 *
 * @param {Object} series - Series metadata
 * @returns {boolean}
 */
const isStructuredReportSeries = series => {
  const supportedSopClassUIDs = [
    '1.2.840.10008.5.1.4.1.1.88.22',
    '1.2.840.10008.5.1.4.1.1.11.1',
    '1.2.840.10008.5.1.4.1.1.88.34', // COMPREHENSIVE_3D_SR
  ];

  const firstInstance = series.instances[0];
  const SOPClassUID = firstInstance.metadata.SOPClassUID;

  return supportedSopClassUIDs.includes(SOPClassUID);
};

/**
 *  Checkes if series1 is newer than series2
 *
 * @param {Object} series1 - Series Metadata 1
 * @param {Object} series2 - Series Metadata 2
 * @returns {boolean} true/false if series1 is newer than series2
 */
const compareSeriesDate = (series1, series2) => {
  return (
    series1.SeriesDate > series2.SeriesDate ||
    (series1.SeriesDate === series2.SeriesDate &&
      series1.SeriesTime > series2.SeriesTime)
  );
};

export default findMostRecentStructuredReport;
