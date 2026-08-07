'use strict';

const { app, BrowserWindow, ipcMain, powerSaveBlocker } = require('electron');
const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const { createServer } = require('node:http');
const path = require('node:path');

app.commandLine.appendSwitch(
  'enable-features',
  'VaapiVideoDecodeLinuxGL,VaapiIgnoreDriverChecks,AcceleratedVideoDecodeLinuxGL',
);
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-gpu-rasterization');

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

let mainWindow;
let staticServer;
let displaySleepBlocker;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function startDisplaySleepBlocker() {
  if (
    displaySleepBlocker !== undefined
    && powerSaveBlocker.isStarted(displaySleepBlocker)
  ) return;
  displaySleepBlocker = powerSaveBlocker.start('prevent-display-sleep');
}

function stopDisplaySleepBlocker() {
  if (
    displaySleepBlocker !== undefined
    && powerSaveBlocker.isStarted(displaySleepBlocker)
  ) {
    powerSaveBlocker.stop(displaySleepBlocker);
  }
  displaySleepBlocker = undefined;
}

function webBuildRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'web-dist')
    : path.resolve(__dirname, '..', '..', 'dist');
}

function sendFile(request, response, filePath) {
  const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream';
  response.writeHead(200, {
    'Cache-Control': contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600',
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = createReadStream(filePath);
  stream.on('error', (error) => {
    console.error(`[desktop] failed to read ${filePath}:`, error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
  stream.pipe(response);
}

async function handleStaticRequest(root, request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }

  const candidate = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end();
    return;
  }

  try {
    const info = await stat(candidate);
    if (info.isFile()) {
      sendFile(request, response, candidate);
      return;
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
      console.error(`[desktop] failed to inspect ${candidate}:`, error);
      response.writeHead(500);
      response.end();
      return;
    }
  }

  if ((request.headers.accept ?? '').includes('text/html')) {
    sendFile(request, response, path.join(root, 'index.html'));
    return;
  }

  response.writeHead(404);
  response.end();
}

function startStaticServer() {
  const root = webBuildRoot();
  staticServer = createServer((request, response) => {
    handleStaticRequest(root, request, response).catch((error) => {
      console.error('[desktop] static server request failed:', error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });

  // A fixed port keeps the app's origin — and with it localStorage (saved
  // servers, last channel) — stable across launches. An ephemeral port would
  // ask for the antenna terminals again on every boot.
  const port = Number.parseInt(process.env.DSP_SHELL_PORT ?? '', 10) || 8412;

  return new Promise((resolve, reject) => {
    staticServer.once('error', (error) => {
      if (error && error.code === 'EADDRINUSE') {
        console.warn(`[desktop] port ${port} busy; falling back to an ephemeral port (stored settings will not carry over)`);
        staticServer.once('error', reject);
        staticServer.listen(0, '127.0.0.1');
        return;
      }
      reject(error);
    });
    staticServer.listen(port, '127.0.0.1', () => {
      const address = staticServer.address();
      const origin = `http://127.0.0.1:${address.port}`;
      console.log(`[desktop] static server up at ${origin} (root: ${root})`);
      resolve(origin);
    });
  });
}

function createMainWindow(origin) {
  let rendererErrorCount = 0;

  mainWindow = new BrowserWindow({
    frame: false,
    fullscreen: true,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  console.log('[desktop] window created');

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (details) => {
    if (new URL(details.url).origin !== origin) details.preventDefault();
  });
  mainWindow.webContents.on('will-redirect', (details) => {
    if (new URL(details.url).origin !== origin) details.preventDefault();
  });
  mainWindow.webContents.on('console-message', (details) => {
    if (details.level === 'error') {
      rendererErrorCount += 1;
      console.error(
        `[desktop] renderer console error (${details.sourceId}:${details.lineNumber}): ${details.message}`,
      );
    }
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedUrl, isMainFrame) => {
    if (isMainFrame) {
      console.error(`[desktop] page load failed (${code} ${description}): ${validatedUrl}`);
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[desktop] page loaded');
    setTimeout(() => {
      console.log(`[desktop] renderer console errors after load: ${rendererErrorCount}`);
    }, 2000);
  });
  mainWindow.webContents.on('media-started-playing', startDisplaySleepBlocker);
  mainWindow.webContents.on('media-paused', stopDisplaySleepBlocker);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    stopDisplaySleepBlocker();
    mainWindow = undefined;
    app.quit();
  });

  mainWindow.loadURL(origin).catch((error) => {
    console.error('[desktop] loadURL failed:', error);
    app.quit();
  });
}

ipcMain.on('dsp-shell:power-off', (event) => {
  if (
    mainWindow
    && event.sender === mainWindow.webContents
    && event.senderFrame === mainWindow.webContents.mainFrame
  ) {
    console.log('[desktop] power off requested');
    app.quit();
  }
});

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const origin = await startStaticServer();
    createMainWindow(origin);
  }).catch((error) => {
    console.error('[desktop] startup failed:', error);
    app.quit();
  });
}

app.on('before-quit', () => {
  staticServer?.close();
  stopDisplaySleepBlocker();
});

app.on('window-all-closed', () => app.quit());
