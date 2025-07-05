import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';

const store = new Store();
let mainWindow: BrowserWindow | null = null;

// Enable ffmpeg for subtitle extraction
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    fullscreen: true, // Launch in fullscreen
    icon: path.join(__dirname, 'png', 'flicktionary_logo.png'),
    fullscreenable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // Allow loading local video files
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    title: 'Flicktionary'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow!.setFullScreen(true);
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:9000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('save-results', async (event, results) => {
  const { filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON', extensions: ['json'] }],
    defaultPath: 'vocabulary-results.json'
  });

  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
    return { success: true, path: filePath };
  }
  return { success: false };
});

ipcMain.handle('get-file-path', async (event, fileData) => {
  // Save temporary file and return path for video player
  const tempPath = path.join(app.getPath('temp'), `video-${Date.now()}.mp4`);
  fs.writeFileSync(tempPath, Buffer.from(fileData));
  return tempPath;
});

// Extract subtitles from video
ipcMain.handle('extract-subtitles', async (event, videoPath) => {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(app.getPath('temp'), `subtitles-${Date.now()}.srt`);
    
    ffmpeg(videoPath)
      .outputOptions('-map 0:s:0') // Extract first subtitle stream
      .outputOptions('-c:s srt')   // Convert to SRT format
      .output(outputPath)
      .on('end', () => {
        try {
          const subtitleContent = fs.readFileSync(outputPath, 'utf8');
          fs.unlinkSync(outputPath); // Clean up temp file
          resolve({ success: true, content: subtitleContent });
        } catch (error) {
          resolve({ success: false, error: 'Failed to read extracted subtitles' });
        }
      })
      .on('error', (err: Error) => {
        resolve({ success: false, error: err.message });
      })
      .run();
  });
});

// API Key management
ipcMain.handle('get-api-key', async () => {
  return store.get('gemini-api-key', null);
});

ipcMain.handle('save-api-key', async (event, apiKey) => {
  store.set('gemini-api-key', apiKey);
  return { success: true };
});

ipcMain.handle('read-file', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(path.join(app.getAppPath(), filePath), 'utf8');
    return { success: true, content };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
  return { success: true };
});