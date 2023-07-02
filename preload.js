const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
	window: message => ipcRenderer.send('window', message),
	ready: () => ipcRenderer.send('ready', true),
	config: (message) => ipcRenderer.send('config', message),
	configAnswer: (message) => ipcRenderer.send('configMessage', message),
	configQuestion: (callback) => ipcRenderer.on('configQuestion', callback),
	configDone: (callback) => ipcRenderer.on('configDone', callback),
	log: (callback) => ipcRenderer.on('log', callback),
	loaded: (callback) => ipcRenderer.on('loaded', callback),
	requestExit: (callback) => ipcRenderer.on('requestExit', callback)
});