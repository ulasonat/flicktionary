const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveResults: (results, videoFileName) =>
    ipcRenderer.invoke('save-results', results, videoFileName),
  extractSubtitles: (videoPath) => ipcRenderer.invoke('extract-subtitles', videoPath),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  convertVideo: (inputPath, outputName) =>
    ipcRenderer.invoke('convert-video', inputPath, outputName),
  readBinaryFile: (filePath) => ipcRenderer.invoke('read-binary-file', filePath)
});
