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
const ffprobePath = require('ffprobe-static').path;
ffmpeg.setFfprobePath(ffprobePath);

if (process.platform === 'darwin') {
  app.setName('Flicktionary');
}

function createWindow() {
  const iconPath = path.join(__dirname, 'png', 'flicktionary_logo.png');

  if (process.platform === 'darwin') {
    app.dock.setIcon(iconPath);
  }

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
    title: 'Flicktionary',
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
ipcMain.handle('save-results', async (_event, results, videoFileName) => {
  const rootDir = app.getAppPath();
  const processedDir = path.join(rootDir, 'processed');
  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }

  const baseName = path.parse(videoFileName).name;
  const filePath = path.join(processedDir, `words_for_${baseName}.json`);

  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  return { success: true, path: filePath };
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

// Convert video (e.g., MKV -> MP4) with progress window
ipcMain.handle('convert-video', async (_event, inputPath, outputName) => {
  return new Promise(resolve => {
    const rootDir = app.getAppPath();
    const convertedDir = path.join(rootDir, 'converted');
    if (!fs.existsSync(convertedDir)) {
      fs.mkdirSync(convertedDir, { recursive: true });
    }

    const outputPath = path.join(convertedDir, `${outputName}.mp4`);

    const progressWin = new BrowserWindow({
      width: 400,
      height: 100,
      parent: mainWindow || undefined,
      modal: true,
      frame: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    progressWin.loadFile(path.join(__dirname, 'progress.html'));

    const start = Date.now();
    ffmpeg(inputPath)
      .outputOptions('-c:v libx264', '-preset veryfast', '-crf 28', '-c:a aac')
      .on('progress', (p: any) => {
        const percent = p.percent || 0;
        const elapsed = (Date.now() - start) / 1000;
        const estTotal = percent > 0 ? elapsed / (percent / 100) : 0;
        const remaining = Math.max(0, estTotal - elapsed);
        progressWin.webContents.send('conversion-progress', percent, remaining.toFixed(0));
      })
      .on('end', () => {
        progressWin.close();
        resolve({ success: true, outputPath });
      })
      .on('error', (err: Error) => {
        progressWin.close();
        resolve({ success: false, error: err.message });
      })
      .save(outputPath);
  });
});

// Read a file as binary (Buffer)
ipcMain.handle('read-binary-file', async (_event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});