const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveResults: (results, videoFileName) =>
    ipcRenderer.invoke('save-results', results, videoFileName),
  getFilePath: (fileData, fileName) =>
    ipcRenderer.invoke('get-file-path', fileData, fileName),
  convertVideo: (fileData, fileName) =>
    ipcRenderer.invoke('convert-video', fileData, fileName),
  extractSubtitles: (videoPath) => ipcRenderer.invoke('extract-subtitles', videoPath),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath)
});
