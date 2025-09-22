import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';

const store = new Store();
let mainWindow: BrowserWindow | null = null;

const uploadedVideoCache = new Map<string, string>();

const rememberUploadedVideo = (originalName: string, storedPath: string) => {
  if (!originalName) return;

  const previousPath = uploadedVideoCache.get(originalName);
  if (previousPath && previousPath !== storedPath && fs.existsSync(previousPath)) {
    try {
      const uploadsDir = path.join(app.getPath('userData'), 'uploads');
      if (previousPath.startsWith(uploadsDir)) {
        fs.unlinkSync(previousPath);
      }
    } catch (cleanupError) {
      console.warn('Failed to remove cached uploaded video', cleanupError);
    }
  }

  uploadedVideoCache.set(originalName, storedPath);
};

const toBuffer = (data: any): Buffer | null => {
  if (!data) return null;

  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(data));
  }

  if (data?.type === 'Buffer' && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }

  if (Array.isArray(data)) {
    return Buffer.from(data);
  }

  return null;
};

// Enable ffmpeg for subtitle extraction
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
process.env.FFPROBE_PATH = ffprobePath;

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

ipcMain.handle('get-file-path', async (event, fileData, originalFileName = 'video.mp4') => {
  // Preserve original file extension
  const extension = path.extname(originalFileName) || '.mp4';
  const baseName = path.basename(originalFileName, extension);

  const uploadsDir = path.join(app.getPath('userData'), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const safeBaseName = baseName.replace(/[^a-z0-9-_]/gi, '_') || 'video';
  const tempPath = path.join(uploadsDir, `${safeBaseName}-${Date.now()}${extension}`);
  const buffer = toBuffer(fileData);
  if (!buffer) {
    throw new Error('Unable to persist uploaded video');
  }

  fs.writeFileSync(tempPath, buffer);

  rememberUploadedVideo(originalFileName, tempPath);
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

ipcMain.handle('convert-to-mp3', async (event, payload) => {
  const rootDir = app.getAppPath();

  let videoPath: string | undefined;
  let originalFileName: string | undefined;
  let videoData: any;

  if (typeof payload === 'string' || payload === undefined) {
    videoPath = payload as string | undefined;
  } else if (payload && typeof payload === 'object') {
    ({ videoPath, originalFileName, videoData } = payload);
  }

  const cachedByName = originalFileName ? uploadedVideoCache.get(originalFileName) : undefined;

  if (!videoPath && cachedByName && fs.existsSync(cachedByName)) {
    videoPath = cachedByName;
  }

  if (!videoPath) {
    videoPath = path.join(rootDir, 'input.mkv');
  }

  if (videoPath && videoPath.startsWith('file://')) {
    videoPath = videoPath.replace('file://', '');
  }

  let tempVideoPath: string | null = null;

  const ensureCachedPath = () => {
    if (cachedByName && fs.existsSync(cachedByName)) {
      return cachedByName;
    }
    return null;
  };

  if (!videoPath || !fs.existsSync(videoPath)) {
    const existingCachedPath = ensureCachedPath();
    if (existingCachedPath) {
      videoPath = existingCachedPath;
    } else if (videoData) {
      const buffer = toBuffer(videoData);
      if (!buffer) {
        return { success: false, error: 'Unable to access uploaded video data' };
      }

      const parsedOriginal = originalFileName ? path.parse(originalFileName) : null;
      const extension = parsedOriginal?.ext || '.mp4';
      const tempBaseName = parsedOriginal?.name || 'video';
      tempVideoPath = path.join(app.getPath('temp'), `${tempBaseName}-${Date.now()}${extension}`);
      fs.writeFileSync(tempVideoPath, buffer);
      videoPath = tempVideoPath;
    } else {
      const fallbackPath = path.join(rootDir, 'input.mkv');
      if (fs.existsSync(fallbackPath)) {
        videoPath = fallbackPath;
      } else {
        return { success: false, error: 'Video file not found' };
      }
    }
  }

  const audioDir = path.join(rootDir, 'audio');
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  const outputBase = originalFileName ? path.parse(originalFileName).name : path.parse(videoPath).name;
  const outputPath = path.join(audioDir, `${outputBase}.mp3`);

  return new Promise((resolve, reject) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const progressWin = new BrowserWindow({
      width: 400,
      height: 150,
      resizable: false,
      parent: parentWindow || undefined,
      modal: true,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    let ffmpegProcess: any = null;

    const cleanupTempFile = () => {
      if (tempVideoPath && fs.existsSync(tempVideoPath)) {
        try {
          fs.unlinkSync(tempVideoPath);
        } catch (cleanupError) {
          console.warn('Failed to remove temporary video file', cleanupError);
        }
        tempVideoPath = null;
      }
    };

    const progressHTML = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body{margin:0;background:#1a1a1a;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%}
          .bar{width:80%;height:20px;border:1px solid #fff;margin-top:10px}
          .fill{height:100%;width:0;background:#4f9cf9}
        </style>
      </head>
      <body>
        <div>Converting Audio...</div>
        <div class="bar"><div class="fill" id="fill"></div></div>
        <div id="percent">0%</div>
        <script>
          const { ipcRenderer } = require('electron');
          ipcRenderer.on('conversion-progress', (_e, p) => {
            document.getElementById('fill').style.width = p + '%';
            document.getElementById('percent').textContent = Math.floor(p) + '%';
          });
          ipcRenderer.on('conversion-done', () => {
            document.getElementById('percent').textContent = 'Done';
            setTimeout(()=>window.close(), 500);
          });
        </script>
      </body>
    </html>`;

    progressWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(progressHTML));
    progressWin.once('ready-to-show', () => progressWin.show());

    progressWin.on('closed', () => {
      if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
        ffmpegProcess = null;
      }
      cleanupTempFile();
    });

    const command = ffmpeg(videoPath)
      .outputOptions('-vn')
      .output(outputPath)
      .on('progress', (prog: { percent: number }) => {
        if (!progressWin.isDestroyed()) {
          progressWin.webContents.send('conversion-progress', prog.percent || 0);
        }
      })
      .on('end', () => {
        if (!progressWin.isDestroyed()) {
          progressWin.webContents.send('conversion-done');
        }
        resolve({ success: true, path: outputPath });
        cleanupTempFile();
        setTimeout(() => {
          if (!progressWin.isDestroyed()) progressWin.close();
        }, 600);
      })
      .on('error', (err: Error) => {
        if (!progressWin.isDestroyed()) {
          progressWin.webContents.send('conversion-done');
        }
        cleanupTempFile();
        reject(err);
        setTimeout(() => {
          if (!progressWin.isDestroyed()) progressWin.close();
        }, 600);
      })
      .run();

    ffmpegProcess = command.ffmpegProc;
  });
});
