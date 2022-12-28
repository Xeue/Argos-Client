const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    configAnswer: (message) => ipcRenderer.send('configMessage', message),
    configQuestion: (callback) => ipcRenderer.on('configQuestion', callback),
    log: (callback) => ipcRenderer.on('log', callback),
    loaded: (callback) => ipcRenderer.on('loaded', callback)
})