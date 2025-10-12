import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import Store from 'electron-store';

const store = new Store();
let mainWindow: BrowserWindow | null = null;
const OPEN_SUBTITLES_USER_AGENT = 'FlicktionarySubFetcher 1.0';

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
  const tempPath = path.join(app.getPath('temp'), `${baseName}-${Date.now()}${extension}`);
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

ipcMain.handle('get-gemini-api-enabled', async () => {
  return store.get('gemini-api-enabled', false);
});

ipcMain.handle('set-gemini-api-enabled', async (_event, enabled) => {
  const value = Boolean(enabled);
  store.set('gemini-api-enabled', value);
  return { success: true, enabled: value };
});

ipcMain.handle('get-auto-generate-enabled', async () => {
  return store.get('gemini-auto-generate-enabled', false);
});

ipcMain.handle('set-auto-generate-enabled', async (_event, enabled) => {
  const value = Boolean(enabled);
  store.set('gemini-auto-generate-enabled', value);
  return { success: true, enabled: value };
});

ipcMain.handle('fetch-subtitles', async (_event, fileName: string) => {
  try {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('A video file name is required');
    }

    const metadata = parseVideoFileName(fileName);
    if (!metadata.title) {
      throw new Error('Unable to derive a movie title from the file name');
    }

    const imdbId = await resolveImdbId(metadata.title, metadata.year);
    if (!imdbId) {
      throw new Error('Unable to resolve IMDb title for subtitle search');
    }

    const subtitleText = await downloadBestSubtitle(imdbId);
    if (!subtitleText) {
      throw new Error('No English subtitles found for this title');
    }

    return {
      success: true,
      subtitle: subtitleText,
      metadata: {
        title: metadata.title,
        year: metadata.year || null,
        imdbId
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to fetch subtitles'
    };
  }
});

interface ParsedVideoMetadata {
  title: string;
  year?: number;
}

const RELEASE_TOKENS = new Set([
  '1080p', '2160p', '720p', '480p', '576p', '4k', '8k', 'hdr', 'dv', 'webrip', 'web', 'hdtv',
  'bluray', 'brrip', 'bdrip', 'dvdrip', 'remux', 'x264', 'x265', 'h264', 'h265',
  'hevc', '10bit', '8bit', 'aac', 'dts', 'truehd', 'atmos', 'xvid', 'yify', 'yts', 'imax',
  'nf', 'amzn', 'webdl', 'dvdscr', 'cam', 'proper', 'repack', 'internal',
  'dual', 'audio', 'subs', 'extended', 'cut', 'hdrip', 'hc', 'mkv', 'mp4', 'avi', 'mov',
  'ytsmx', 'rarbg', 'microhd', 'br', 'it', 'us', 'multi', 'subbed', 'uncensored'
]);

const ROMAN_NUMERAL_REGEX = /^(?=[MDCLXVI])(M{0,4}(CM)?D?(CD)?C{0,3}(XC)?L?(XL)?X{0,3}(IX)?V?(IV)?I{0,3})$/i;

function normaliseToken(token: string): string {
  return token.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function titleCaseToken(token: string): string {
  if (!token) {
    return token;
  }
  if (ROMAN_NUMERAL_REGEX.test(token)) {
    return token.toUpperCase();
  }
  if (token.length <= 2) {
    return token.toLowerCase();
  }
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function parseVideoFileName(fileName: string): ParsedVideoMetadata {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  const cleaned = withoutExtension
    .replace(/[\[\]\(\)]/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned.split(' ');
  const titleTokens: string[] = [];
  let detectedYear: number | undefined;

  for (const rawToken of tokens) {
    if (!rawToken) {
      continue;
    }

    const token = rawToken.trim();
    const normalised = normaliseToken(token);

    const yearMatch = token.match(/^(19|20)\d{2}$/);
    if (yearMatch && !detectedYear) {
      detectedYear = Number(token);
      break;
    }

    if (!normalised) {
      continue;
    }

    if (RELEASE_TOKENS.has(normalised)) {
      continue;
    }

    if (/^\d+p$/.test(normalised) || /^\d+k$/.test(normalised)) {
      continue;
    }

    if (/^s\d{2}e\d{2}$/i.test(token)) {
      continue;
    }

    titleTokens.push(titleCaseToken(token));
  }

  const title = titleTokens.join(' ').trim();

  return {
    title,
    year: detectedYear
  };
}

function tokeniseForComparison(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

function computeTokenSimilarity(a: string, b: string): number {
  const setA = tokeniseForComparison(a);
  const setB = tokeniseForComparison(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

async function resolveImdbId(title: string, year?: number): Promise<string | null> {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }

  const firstChar = trimmed[0].toLowerCase().match(/[a-z0-9]/)?.[0] || '0';
  const suggestionUrl = `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(trimmed)}.json`;
  const response = await fetch(suggestionUrl, {
    headers: {
      'User-Agent': OPEN_SUBTITLES_USER_AGENT,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`IMDb lookup failed (${response.status})`);
  }

  const data: any = await response.json();
  const candidates: any[] = Array.isArray(data?.d) ? data.d : [];
  if (candidates.length === 0) {
    return null;
  }

  let bestId: string | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    if (!candidate?.id || !candidate?.l) {
      continue;
    }

    if (candidate.qid && !['movie', 'feature', 'tvMovie'].includes(candidate.qid)) {
      continue;
    }

    const candidateYear = typeof candidate.y === 'number' ? candidate.y : undefined;
    const similarity = computeTokenSimilarity(trimmed, candidate.l);
    let score = similarity;

    if (year && candidateYear) {
      const diff = Math.abs(candidateYear - year);
      score += diff === 0 ? 0.4 : diff === 1 ? 0.2 : 0;
    }

    if (candidateYear && !year) {
      // Prefer older titles when no year provided but candidate matches high similarity
      score += 0.05;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }

  return bestId;
}

async function downloadBestSubtitle(imdbId: string): Promise<string | null> {
  const imdbNumeric = imdbId.replace(/^tt/, '');
  if (!imdbNumeric) {
    return null;
  }

  const searchUrl = `https://rest.opensubtitles.org/search/imdbid-${imdbNumeric}/sublanguageid-eng`;
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': OPEN_SUBTITLES_USER_AGENT,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`OpenSubtitles search failed (${response.status})`);
  }

  const results: any[] = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const sorted = [...results].sort((a, b) => {
    const ratingDiff = (Number(b?.SubRating) || 0) - (Number(a?.SubRating) || 0);
    if (ratingDiff !== 0) {
      return ratingDiff;
    }
    return (Number(b?.SubDownloadsCnt) || 0) - (Number(a?.SubDownloadsCnt) || 0);
  });

  const candidate = sorted.find(item => item?.SubFormat === 'srt' && item?.SubDownloadLink) || sorted[0];
  const downloadUrl: string | undefined = candidate?.SubDownloadLink || candidate?.ZipDownloadLink;

  if (!downloadUrl) {
    throw new Error('Subtitle download link missing');
  }

  const downloadResponse = await fetch(downloadUrl, {
    headers: {
      'User-Agent': OPEN_SUBTITLES_USER_AGENT
    }
  });

  if (!downloadResponse.ok) {
    throw new Error(`Subtitle download failed (${downloadResponse.status})`);
  }

  let buffer = Buffer.from(await downloadResponse.arrayBuffer());

  if (downloadUrl.endsWith('.gz')) {
    try {
      buffer = zlib.gunzipSync(buffer);
    } catch (error) {
      throw new Error('Failed to decompress subtitle archive');
    }
  }

  let subtitleText = buffer.toString('utf8');
  if (!subtitleText.trim()) {
    subtitleText = buffer.toString('latin1');
  }

  return subtitleText;
}

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

ipcMain.handle('convert-to-mp3', async (event, videoPath) => {
  const rootDir = app.getAppPath();

  if (!videoPath || typeof videoPath !== 'string') {
    videoPath = path.join(rootDir, 'input.mkv');
  }

  if (videoPath.startsWith('file://')) {
    videoPath = videoPath.replace('file://', '');
  }

  if (!fs.existsSync(videoPath)) {
    const fallbackPath = path.join(rootDir, 'input.mkv');
    if (fs.existsSync(fallbackPath)) {
      videoPath = fallbackPath;
    } else {
      return { success: false, error: 'Video file not found' };
    }
  }

  const audioDir = path.join(rootDir, 'audio');
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  const baseName = path.parse(videoPath).name;
  const outputPath = path.join(audioDir, `${baseName}.mp3`);

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
        setTimeout(() => {
          if (!progressWin.isDestroyed()) progressWin.close();
        }, 600);
      })
      .on('error', (err: Error) => {
        if (!progressWin.isDestroyed()) {
          progressWin.webContents.send('conversion-done');
        }
        reject(err);
        setTimeout(() => {
          if (!progressWin.isDestroyed()) progressWin.close();
        }, 600);
      })
      .run();

    ffmpegProcess = command.ffmpegProc;
  });
});
