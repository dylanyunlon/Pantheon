const noop = () => {};
const noopAsync = () => Promise.resolve();
const noopArr = () => [];

const instance = {
  install: noop,
  uninstall: noop,
  on: noop,
  sendKey: noopAsync,
  sendString: noopAsync,
};

exports.tools = {
  getPidsByName: noopArr,
  getCommandLine1: () => '',
  isElevated: () => false,
  isProcessForeground: () => false,
  isProcessRunning: () => false,
  terminateProcess: noop,
  fixWindowMethodA: noop,
  getLeagueClientWindowPlacementInfo: () => ({
    left: 0, top: 0, right: 0, bottom: 0, showCmd: 0,
  }),
};

exports.input = {
  instance,
  VKEY_MAP: new Proxy({}, { get: () => ({ keyId: '', vkCode: 0 }) }),
  UNIFIED_KEY_ID: {},
  isModifierKey: () => false,
};
