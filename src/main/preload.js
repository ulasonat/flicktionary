const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveResults: (results, videoFileName) =>
    ipcRenderer.invoke('save-results', results, videoFileName),
  getFilePath: (fileData, originalFileName) => ipcRenderer.invoke('get-file-path', fileData, originalFileName),
  extractSubtitles: (videoPath) => ipcRenderer.invoke('extract-subtitles', videoPath),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  convertToMp3: (videoPath) => ipcRenderer.invoke('convert-to-mp3', videoPath),
  openProgressWindow: () => ipcRenderer.invoke('open-progress-window'),
  onConvertProgress: (callback) => ipcRenderer.on('convert-progress', (_e, p) => callback(p))
});
