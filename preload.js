const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Only expose the READ method
  invokeDbQuery: (queryName, params) => {
    // This sends a message to the main process via 'main-process-query' channel
    return ipcRenderer.invoke('main-process-query', { queryName, params });
  }
});