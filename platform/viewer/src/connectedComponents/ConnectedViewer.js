import { connect } from 'react-redux';
import Viewer from './Viewer.js';
import OHIF from '@ohif/core';

const { setTimepoints, setMeasurements } = OHIF.redux.actions;

const getActiveServer = servers => {
  const isActive = a => a.active === true;
  const isGoogleStore = a => a.isGoogleStore === true;

  let activeServers = 0;
  servers.servers.forEach(server => {
    if (server.active === true) {
      activeServers = activeServers + 1;
    }
  });

  if (activeServers > 1) {
    return servers.servers.find(isActive && isGoogleStore);
  } else {
    return servers.servers.find(isActive);
  }
};

const mapStateToProps = state => {
  const { viewports, servers } = state;
  return {
    viewports: viewports.viewportSpecificData,
    activeViewportIndex: viewports.activeViewportIndex,
    activeServer: getActiveServer(servers),
  };
};

const mapDispatchToProps = dispatch => {
  return {
    onTimepointsUpdated: timepoints => {
      dispatch(setTimepoints(timepoints));
    },
    onMeasurementsUpdated: measurements => {
      dispatch(setMeasurements(measurements));
    },
  };
};

const ConnectedViewer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Viewer);

export default ConnectedViewer;
