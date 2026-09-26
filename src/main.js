const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, Notification, safeStorage, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const i18n = require('./i18n');

// Config storage path
const configDir = path.join(app.getPath('userData'), 'config.json');

const DEEPSEEK_PROVIDER = {
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  modelsPath: '/models',
  balancePath: '/user/balance',
  usagePath: '/dashboard/usage',
  loginUrl: 'https://platform.deepseek.com'
};

// Default config
let config = {
  accounts: [],
  activeAccountId: '',
  autoLaunch: false,
  autoRefreshEnabled: true,
  refreshIntervalSeconds: 300,
  windowBounds: { width: 380, height: 680 },
  budgetAlertEnabled: true,
  balanceThreshold: 50,
  budgetAlertState: {},
  alwaysOnTop: false,
  alwaysOnTopBehavior: 'none', // 'none' | 'hide' | 'fade'
  alwaysOnTopOpacity: 0.35,
  language: i18n.DEFAULT_LANGUAGE
};

function t(key, params) {
  return i18n.translate(config.language, key, params);
}

// ============ Secret encryption (safeStorage) ============
// apiKey / usageToken are stored encrypted when the OS keychain is available.
// Stored format: "enc:v1:<base64>". Plain text is kept as a fallback
// (e.g. Linux without a keyring), matching previous behavior.

function encryptSecret(plain) {
  if (!plain) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:v1:' + safeStorage.encryptString(plain).toString('base64');
    }
  } catch (e) {
    console.error('Encrypt error:', e);
  }
  return plain;
}

function decryptSecret(stored) {
  if (!stored) return '';
  if (String(stored).startsWith('enc:v1:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(7), 'base64'));
    } catch (e) {
      console.error('Decrypt error:', e);
      return '';
    }
  }
  return stored;
}

// ============ Account helpers ============

function getActiveAccount() {
  if (!config.accounts.length) return null;
  let account = config.accounts.find((a) => a.id === config.activeAccountId);
  if (!account) {
    account = config.accounts[0];
    config.activeAccountId = account.id;
  }
  return account;
}

function ensureAccount() {
  if (!config.accounts.length) {
    config.accounts.push({ id: crypto.randomUUID(), name: t('account.default'), apiKey: '', usageToken: '' });
    config.activeAccountId = config.accounts[0].id;
  }
  return getActiveAccount();
}

function safeAccount(account) {
  return {
    id: account.id,
    name: account.name,
    hasApiKey: !!account.apiKey,
    hasUsageToken: !!account.usageToken
  };
}

// Migrate legacy flat config (apiKey/usageToken/providers) to the multi-account shape.
// Also fills in defaults for newer settings. Returns true when something changed.
function normalizeConfig() {
  let migrated = false;

  if (!Array.isArray(config.accounts) || config.accounts.length === 0) {
    const oldDeepSeek = config.providers?.deepseek || {};
    const legacyKey = config.apiKey || oldDeepSeek.apiKey || '';
    const legacyToken = config.usageToken || oldDeepSeek.usageToken || '';
    config.accounts = [{
      id: crypto.randomUUID(),
      name: t('account.default'),
      apiKey: legacyKey,
      usageToken: legacyToken
    }];
    delete config.apiKey;
    delete config.usageToken;
    migrated = true;
  }

  if (!config.activeAccountId || !config.accounts.some((a) => a.id === config.activeAccountId)) {
    config.activeAccountId = config.accounts[0].id;
    migrated = true;
  }

  if (config.budgetAlertEnabled === undefined) {
    config.budgetAlertEnabled = true;
    migrated = true;
  }
  if (config.balanceThreshold === undefined) {
    config.balanceThreshold = 50;
    migrated = true;
  }
  if (typeof config.budgetAlertState !== 'object' || !config.budgetAlertState) {
    config.budgetAlertState = {};
    migrated = true;
  }
  if (config.alwaysOnTop === undefined) {
    config.alwaysOnTop = false;
    migrated = true;
  }
  if (!['none', 'hide', 'fade'].includes(config.alwaysOnTopBehavior)) {
    config.alwaysOnTopBehavior = 'none';
    migrated = true;
  }
  const onTopOpacity = Number(config.alwaysOnTopOpacity);
  if (!Number.isFinite(onTopOpacity)) {
    config.alwaysOnTopOpacity = 0.35;
    migrated = true;
  } else {
    config.alwaysOnTopOpacity = Math.min(1, Math.max(0.05, Math.round(onTopOpacity * 100) / 100));
  }

  const language = i18n.normalizeLanguage(config.language);
  if (config.language !== language) {
    config.language = language;
    migrated = true;
  }

  delete config.selectedProvider;
  delete config.providers;

  if (migrated) saveConfig();
  return migrated;
}

function getActiveProvider() {
  normalizeConfig();
  const account = getActiveAccount() || {};
  return {
    ...DEEPSEEK_PROVIDER,
    apiKey: account.apiKey || '',
    usageToken: account.usageToken || ''
  };
}

function getActiveUsageToken() {
  const account = getActiveAccount();
  return (account && account.usageToken) || '';
}

// ============ Config load / save ============

function loadConfig() {
  try {
    if (fs.existsSync(configDir)) {
      const data = fs.readFileSync(configDir, 'utf8');
      const parsed = JSON.parse(data);
      config = { ...config, ...parsed };
      if (Array.isArray(config.accounts)) {
        // Decrypt stored secrets; flag plain-text leftovers so they get
        // re-encrypted on the next save.
        let hasPlainSecret = false;
        config.accounts = config.accounts.map((a) => {
          const apiKey = decryptSecret(a.apiKey || '');
          const usageToken = decryptSecret(a.usageToken || '');
          if (a.apiKey && !String(a.apiKey).startsWith('enc:v1:')) hasPlainSecret = true;
          if (a.usageToken && !String(a.usageToken).startsWith('enc:v1:')) hasPlainSecret = true;
          return {
            id: a.id || crypto.randomUUID(),
            name: a.name || t('account.default'),
            apiKey,
            usageToken
          };
        });
        if (hasPlainSecret) {
          saveConfig();
        }
      }
    }
    normalizeConfig();
  } catch (e) {
    console.error('Config load error:', e);
    normalizeConfig();
  }
}

function saveConfig() {
  try {
    const serializable = {
      ...config,
      accounts: config.accounts.map((a) => ({
        ...a,
        apiKey: encryptSecret(a.apiKey),
        usageToken: encryptSecret(a.usageToken)
      }))
    };
    fs.writeFileSync(configDir, JSON.stringify(serializable, null, 2));
  } catch (e) {
    console.error('Config save error:', e);
  }
}

// ============ Auto launch management ============

function setAutoLaunch(enabled) {
  try {
    const appPath = app.getPath('exe');
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
      const appName = 'DeepSeekMonitor';
      if (enabled) {
        execSync(`reg add "${regKey}" /v "${appName}" /t REG_SZ /d "${appPath}" /f`);
      } else {
        try { execSync(`reg delete "${regKey}" /v "${appName}" /f`); } catch (e) {}
      }
    } else if (process.platform === 'darwin') {
      // macOS LaunchAgent approach
      const launchAgentDir = path.join(app.getPath('home'), 'Library', 'LaunchAgents');
      const plistPath = path.join(launchAgentDir, 'com.deepseek.monitor.plist');
      if (enabled) {
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.deepseek.monitor</string>
  <key>ProgramArguments</key>
  <array>
    <string>${appPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>`;
        fs.mkdirSync(launchAgentDir, { recursive: true });
        fs.writeFileSync(plistPath, plist);
      } else {
        try { fs.unlinkSync(plistPath); } catch (e) {}
      }
    }
    config.autoLaunch = enabled;
    saveConfig();
  } catch (e) {
    console.error('AutoLaunch error:', e);
  }
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Always-on-top level: 'screen-saver' stays above almost everything on
// Windows/macOS; Linux only supports 'normal'/'floating'.
const ON_TOP_LEVEL = process.platform === 'linux' ? 'floating' : 'screen-saver';

function showMainWindow() {
  if (!mainWindow) createWindow();
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  sendToRenderer('window-shown');
}

function getAppIconPath() {
  return path.join(__dirname, '..', 'assets', 'icon.png');
}

function applyWindowPolicy() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const onTop = !!config.alwaysOnTop;
  try {
    mainWindow.setAlwaysOnTop(onTop, onTop ? ON_TOP_LEVEL : undefined);
  } catch (e) {
    console.error('setAlwaysOnTop error:', e);
  }
  // 完全取消任务栏/Dock 图标：应用始终驻留系统托盘
  mainWindow.setSkipTaskbar(true);
  applyLinuxSkipTaskbar();
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }
  syncHoverBehavior();
}

function saveWindowOptions(options = {}) {
  if (typeof options.alwaysOnTop === 'boolean') config.alwaysOnTop = options.alwaysOnTop;
  if (['none', 'hide', 'fade'].includes(options.alwaysOnTopBehavior)) {
    config.alwaysOnTopBehavior = options.alwaysOnTopBehavior;
  }
  if (options.alwaysOnTopOpacity !== undefined) {
    const opacity = Number(options.alwaysOnTopOpacity);
    if (Number.isFinite(opacity)) {
      config.alwaysOnTopOpacity = Math.min(1, Math.max(0.05, Math.round(opacity * 100) / 100));
    }
  }
  saveConfig();
  applyWindowPolicy();
  if (tray) tray.setContextMenu(buildTrayMenu());
  return {
    success: true,
    alwaysOnTop: !!config.alwaysOnTop,
    alwaysOnTopBehavior: config.alwaysOnTopBehavior || 'none',
    alwaysOnTopOpacity: Number(config.alwaysOnTopOpacity) || 0.35
  };
}

// ============ Always-on-top hover behavior ============
// When always-on-top is enabled the window stays fully visible until the
// cursor moves over it: it then auto-hides or fades to a preset opacity and
// becomes click-through, so it never blocks what's underneath. It restores
// as soon as the cursor leaves the window bounds. The cursor is polled
// because a click-through window stops receiving DOM mouse events.

let hoverPollTimer = null;
let hoverInsideSince = 0;
let hoverStateActive = false;
let hoverAppliedOpacity = null;
const HOVER_ACTIVATE_DELAY_MS = 250;
const HOVER_POLL_INTERVAL_MS = 150;

// On Linux, Electron's screen.getCursorScreenPoint() can return a stale
// cached position, so query the X server directly (pure-JS x11 client).
let x11PointerQuery = null;
let x11Display = null;

function initX11PointerQuery() {
  if (x11PointerQuery || process.platform !== 'linux') return true;
  try {
    const x11 = require('x11');
    x11.createClient((err, display) => {
      if (err || !display) {
        console.error('X11 client error:', err);
        x11PointerQuery = null;
        return;
      }
      x11Display = display;
      const root = display.screen[0].root;
      x11PointerQuery = (callback) => {
        display.client.QueryPointer(root, (qerr, ptr) => {
          if (qerr) return callback(qerr);
          callback(null, { x: ptr.rootX, y: ptr.rootY });
        });
      };
      applyLinuxSkipTaskbar();
    });
    return true;
  } catch (e) {
    console.error('X11 pointer init error:', e);
    return false;
  }
}

// Electron's setSkipTaskbar() does not set _NET_WM_STATE_SKIP_TASKBAR on all
// Linux environments, so send the EWMH client message directly to the window
// manager to keep the window out of the taskbar / dock.
function applyLinuxSkipTaskbar() {
  if (process.platform !== 'linux') return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  initX11PointerQuery();
  const client = x11Display && x11Display.client;
  if (!client) return;
  const wid = mainWindow.getNativeWindowHandle().readUInt32LE(0);
  const root = x11Display.screen[0].root;
  client.InternAtom(false, '_NET_WM_STATE', (err, stateAtom) => {
    if (err || !stateAtom) return;
    client.InternAtom(false, '_NET_WM_STATE_SKIP_TASKBAR', (err2, skipAtom) => {
      if (err2 || !skipAtom) return;
      // EWMH _NET_WM_STATE: action=1 (ADD), state, 0, source=1 (application), 0
      client.SendClientMessage(root, wid, stateAtom, 32, [1, skipAtom, 0, 1, 0], () => {});
    });
  });
}

function queryPointerPosition(callback) {
  if (process.platform === 'linux') {
    initX11PointerQuery();
    if (!x11PointerQuery) {
      // Connection not ready yet: fall back to Electron for this tick
      callback(null, screen.getCursorScreenPoint());
      return;
    }
    x11PointerQuery(callback);
    return;
  }
  callback(null, screen.getCursorScreenPoint());
}

function getHoverTargetOpacity() {
  if (!config.alwaysOnTop) return 1;
  if (config.alwaysOnTopBehavior === 'hide') return 0;
  if (config.alwaysOnTopBehavior === 'fade') return Number(config.alwaysOnTopOpacity) || 0.35;
  return 1;
}

function applyHoverState(inside) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const opacity = inside ? getHoverTargetOpacity() : 1;
  if (inside === hoverStateActive && opacity === hoverAppliedOpacity) return;
  mainWindow.setIgnoreMouseEvents(inside);
  sendToRenderer('window-hover-state', { inside, opacity });
  hoverStateActive = inside;
  hoverAppliedOpacity = opacity;
}

function pollHoverState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) {
    hoverInsideSince = 0;
    if (hoverStateActive) applyHoverState(false);
    return;
  }
  queryPointerPosition((err, point) => {
    if (err || !point || !mainWindow || mainWindow.isDestroyed()) return;
    let bounds = mainWindow.getBounds();
    if (process.platform === 'linux' && x11PointerQuery) {
      // XQueryPointer returns physical pixels; convert DIP bounds via scale
      const scale = screen.getDisplayMatching(bounds).scaleFactor || 1;
      bounds = {
        x: bounds.x * scale,
        y: bounds.y * scale,
        width: bounds.width * scale,
        height: bounds.height * scale
      };
    }
    const inside = point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
                   point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    if (inside) {
      if (!hoverInsideSince) hoverInsideSince = Date.now();
      if (Date.now() - hoverInsideSince >= HOVER_ACTIVATE_DELAY_MS) {
        applyHoverState(true);
      }
    } else {
      hoverInsideSince = 0;
      applyHoverState(false);
    }
  });
}

function syncHoverBehavior() {
  if (hoverPollTimer) {
    clearInterval(hoverPollTimer);
    hoverPollTimer = null;
  }
  const active = !!config.alwaysOnTop && ['hide', 'fade'].includes(config.alwaysOnTopBehavior);
  if (!active) {
    hoverInsideSince = 0;
    if (hoverStateActive) applyHoverState(false);
    else sendToRenderer('window-hover-state', { inside: false, opacity: 1 });
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  pollHoverState();
  hoverPollTimer = setInterval(pollHoverState, HOVER_POLL_INTERVAL_MS);
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function notify(title, body) {
  try {
    if (!Notification.isSupported()) return;
    const notification = new Notification({ title, body });
    notification.on('click', () => showMainWindow());
    notification.show();
  } catch (e) {
    console.error('Notification error:', e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 640,
    minWidth: 360,
    minHeight: 580,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    icon: getAppIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#00000000',
    title: 'DeepSeek Monitor',
    titleBarStyle: 'hidden',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.platform !== 'darwin') {
    const winIcon = nativeImage.createFromPath(getAppIconPath());
    if (!winIcon.isEmpty()) mainWindow.setIcon(winIcon);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    applyLinuxSkipTaskbar();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('minimize', () => {
    // 最小化后隐藏到托盘，确保任务栏不残留图标
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Dev tools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  applyWindowPolicy();
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) return nativeImage.createEmpty();
  const source = nativeImage.createFromPath(iconPath);
  if (process.platform !== 'darwin') return source.resize({ width: 16, height: 16 });

  // macOS menu bar: a monochrome template image (icon silhouette from its alpha
  // channel) that the system tints like the other menu bar icons.
  const image = nativeImage.createEmpty();
  for (const scaleFactor of [1, 2]) {
    const size = 18 * scaleFactor;
    const bitmap = source.resize({ width: size, height: size, quality: 'best' }).toBitmap();
    for (let i = 0; i < bitmap.length; i += 4) {
      bitmap[i] = 0;
      bitmap[i + 1] = 0;
      bitmap[i + 2] = 0;
    }
    image.addRepresentation({ scaleFactor, width: size, height: size, buffer: bitmap });
  }
  image.setTemplateImage(true);
  return image;
}

// Create tray icon
function createTray() {
  if (tray) return;

  tray = new Tray(createTrayIcon());
  tray.setToolTip('DeepSeek Monitor');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    showMainWindow();
  });
}

function buildTrayMenu() {
  const onTop = !!config.alwaysOnTop;
  const behavior = onTop ? (config.alwaysOnTopBehavior || 'none') : 'none';
  const opacity = Number(config.alwaysOnTopOpacity) || 0.35;
  const close = (v) => Math.abs(opacity - v) < 0.001;
  return Menu.buildFromTemplate([
    { label: t('tray.show'), click: showMainWindow },
    { type: 'separator' },
    {
      label: t('tray.onTop'),
      type: 'checkbox',
      checked: onTop,
      click: (item) => saveWindowOptions({ alwaysOnTop: item.checked })
    },
    {
      label: t('tray.hoverBehavior'),
      enabled: onTop,
      submenu: [
        { label: t('onTop.none'), type: 'radio', checked: behavior === 'none', click: () => saveWindowOptions({ alwaysOnTopBehavior: 'none' }) },
        { label: t('onTop.hide'), type: 'radio', checked: behavior === 'hide', click: () => saveWindowOptions({ alwaysOnTopBehavior: 'hide' }) },
        { label: t('onTop.fade'), type: 'radio', checked: behavior === 'fade', click: () => saveWindowOptions({ alwaysOnTopBehavior: 'fade' }) }
      ]
    },
    {
      label: t('settings.onTop.opacity'),
      enabled: onTop && behavior === 'fade',
      submenu: [
        { label: '20%', type: 'radio', checked: close(0.2), click: () => saveWindowOptions({ alwaysOnTopOpacity: 0.2 }) },
        { label: '35%', type: 'radio', checked: close(0.35), click: () => saveWindowOptions({ alwaysOnTopOpacity: 0.35 }) },
        { label: '50%', type: 'radio', checked: close(0.5), click: () => saveWindowOptions({ alwaysOnTopOpacity: 0.5 }) },
        { label: '70%', type: 'radio', checked: close(0.7), click: () => saveWindowOptions({ alwaysOnTopOpacity: 0.7 }) }
      ]
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
}

// ============ Auto updater ============

function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => {
    sendToRenderer('update-status', { status: 'available', message: t('update.available') });
  });
  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update-status', { status: 'not-available', message: t('update.notAvailable') });
  });
  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update-status', {
      status: 'downloading',
      percent: Math.round(progress.percent || 0),
      message: t('update.downloading')
    });
  });
  autoUpdater.on('update-downloaded', () => {
    sendToRenderer('update-status', { status: 'downloaded', message: t('update.downloaded') });
    notify(t('update.notifyTitle'), t('update.notifyBody'));
  });
  autoUpdater.on('error', (error) => {
    const detail = String(error.message || error);
    sendToRenderer('update-status', { status: 'error', error: detail, message: t('update.error', { error: detail }) });
  });
}

// Single instance: launching the app again (Finder, Spotlight, Start menu) brings
// back the existing window instead of starting a second tray app.
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) app.quit();

app.on('second-instance', () => {
  if (app.isReady()) showMainWindow();
});

// macOS: reopening the running app (it has no Dock icon) restores the hidden window.
app.on('activate', () => {
  if (app.isReady()) showMainWindow();
});

app.whenReady().then(() => {
  if (!isPrimaryInstance) return;
  app.setAppUserModelId('com.deepseek.monitor');
  loadConfig();
  createWindow();
  createTray();
  initAutoUpdater();
  // Background update check on startup (silent, packaged builds only)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  // Keep the app running in the tray until the user chooses "Quit".
});

app.on('before-quit', () => {
  isQuitting = true;
  if (x11Display && x11Display.client && typeof x11Display.client.terminate === 'function') {
    try { x11Display.client.terminate(); } catch (e) {}
  }
});

// ============ IPC Handlers ============

function buildProviderUrl(provider, path, query = {}) {
  const baseUrl = provider.baseUrl || '';
  if (!baseUrl) throw new Error('No provider base URL');

  const cleanPath = String(path || '').replace(/^\/+/, '');
  const target = new URL(cleanPath || '.', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, value);
  }
  return target;
}

function requestProvider(path, options = {}) {
  return new Promise((resolve) => {
    const provider = options.provider || getActiveProvider();
    if (!provider.apiKey) {
      resolve({ success: false, error: 'No API key' });
      return;
    }
    if (!provider.baseUrl) {
      resolve({ success: false, error: 'No provider base URL' });
      return;
    }

    let target;
    try {
      target = buildProviderUrl(provider, path, options.query);
    } catch (e) {
      resolve({ success: false, error: e.message });
      return;
    }

    const transport = target.protocol === 'http:' ? http : https;
    const body = options.body || null;

    const requestOptions = {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'http:' ? 80 : 443),
      path: `${target.pathname}${target.search}`,
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    };
    if (body) requestOptions.headers['Content-Length'] = Buffer.byteLength(body);

    const req = transport.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          const httpOk = res.statusCode >= 200 && res.statusCode < 300;
          const businessCode = json && typeof json === 'object' ? json.code : undefined;
          const businessOk = businessCode === undefined || businessCode === 0;
          resolve({
            success: httpOk && businessOk,
            status: res.statusCode,
            code: businessCode,
            error: httpOk && !businessOk ? (json.msg || json.message || t('err.business', { code: businessCode })) : undefined,
            data: json
          });
        } catch (e) {
          resolve({ success: false, status: res.statusCode, error: 'Parse error', raw: data });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.setTimeout(options.timeout || 10000, () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    if (body) req.write(body);
    req.end();
  });
}

function normalizeModels(data) {
  const rawModels = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
  return rawModels
    .map((model) => {
      const id = model.id || model.name || model.model || '';
      if (!id) return null;
      return {
        id,
        name: model.display_name || model.name || id,
        ownedBy: model.owned_by || model.owner || getActiveProvider().name,
        created: model.created || null
      };
    })
    .filter(Boolean);
}

function normalizeBalance(rawData) {
  if (!rawData || typeof rawData !== 'object') return rawData;

  // DeepSeek 格式：已经是标准格式
  if (Array.isArray(rawData.balance_infos)) {
    return rawData;
  }

  return rawData;
}

function getBalanceTotals(rawData) {
  const normalized = normalizeBalance(rawData);
  const infos = Array.isArray(normalized?.balance_infos) ? normalized.balance_infos : [];
  const totalBalance = infos.reduce((sum, item) => sum + Number(item.total_balance || 0), 0);
  const voucherBalance = infos.reduce((sum, item) => sum + Number(item.voucher_balance || item.granted_balance || 0), 0);
  const cashBalance = infos.reduce((sum, item) => sum + Number(item.cash_balance || item.topped_up_balance || 0), 0);
  // The alert threshold is compared in the account's primary (first reported) currency.
  const currency = infos[0]?.currency || 'CNY';
  const primaryBalance = infos
    .filter((item) => (item.currency || 'CNY') === currency)
    .reduce((sum, item) => sum + Number(item.total_balance || 0), 0);
  return { totalBalance, voucherBalance, cashBalance, currency, primaryBalance, normalized };
}

// ============ Budget alerts ============

function maybeAlertLowBalance(account, total, currency) {
  if (config.budgetAlertEnabled === false || !account) return;
  const threshold = Number(config.balanceThreshold || 0);
  const value = Number(total);
  if (!(threshold > 0) || !Number.isFinite(value)) return;

  const stateKey = account.id;
  const prev = config.budgetAlertState[stateKey] || 'ok';
  if (value < threshold && prev !== 'below') {
    config.budgetAlertState[stateKey] = 'below';
    saveConfig();
    notify(
      t('alert.title'),
      t('alert.body', { name: account.name, balance: i18n.formatMoney(value, currency), threshold: i18n.formatMoney(threshold, currency) })
    );
  } else if (value >= threshold && prev === 'below') {
    config.budgetAlertState[stateKey] = 'ok';
    saveConfig();
  }
}

function requestJsonUrl(targetUrl, token, options = {}) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(targetUrl);
    } catch (e) {
      resolve({ success: false, error: e.message });
      return;
    }

    const transport = target.protocol === 'http:' ? http : https;
    const requestOptions = {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'http:' ? 80 : 443),
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        'x-app-version': '1.0.0',
        ...(options.headers || {})
      }
    };

    const req = transport.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ success: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json });
        } catch (e) {
          resolve({ success: false, status: res.statusCode, error: 'Parse error', raw: data });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.setTimeout(options.timeout || 15000, () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });
    req.end();
  });
}

function usageErrorFromResult(result) {
  if (result.code === 40003 || String(result.error || '').toLowerCase().includes('invalid token')) {
    return t('usage.tokenExpired');
  }
  if (result.status === 401) return t('usage.tokenExpired');
  if (result.status === 429) return t('usage.rateLimited');
  if (result.error) return result.error;
  if (result.status) return t('usage.httpError', { status: result.status });
  return result.error || t('usage.queryFailed');
}

function tokenBreakdown(entries = []) {
  let totalTokens = 0;
  let requestCount = 0;
  let cacheHitTokens = 0;
  let cacheMissTokens = 0;
  let responseTokens = 0;

  for (const entry of entries) {
    const type = entry.type || entry.kind || '';
    const value = Math.round(Number(entry.amount || entry.value || 0));
    if (type === 'REQUEST') requestCount = value;
    if (type === 'PROMPT_CACHE_HIT_TOKEN') {
      cacheHitTokens = value;
      totalTokens += value;
    } else if (type === 'PROMPT_CACHE_MISS_TOKEN') {
      cacheMissTokens = value;
      totalTokens += value;
    } else if (type === 'RESPONSE_TOKEN') {
      responseTokens = value;
      totalTokens += value;
    } else if (type === 'PROMPT_TOKEN') {
      totalTokens += value;
    }
  }

  return { totalTokens, requestCount, cacheHitTokens, cacheMissTokens, responseTokens };
}

function costSum(entries = []) {
  return entries
    .filter((entry) => (entry.type || entry.kind) !== 'REQUEST')
    .reduce((sum, entry) => sum + Number(entry.amount || entry.value || 0), 0);
}

function emptyUsageDay(date) {
  return {
    date,
    flashTokens: 0,
    flashCacheHit: 0,
    flashCacheMiss: 0,
    flashResponse: 0,
    proTokens: 0,
    proCacheHit: 0,
    proCacheMiss: 0,
    proResponse: 0,
    totalTokens: 0,
    totalCost: 0
  };
}

function modelLabel(model) {
  const id = String(model || '').toLowerCase();
  if (id === 'deepseek-v4-flash' || id.includes('flash') || id.includes('chat')) {
    return { key: 'flash', name: 'V4 Flash' };
  }
  if (id === 'deepseek-v4-pro' || id.includes('pro') || id.includes('reasoner') || id.includes('r1')) {
    return { key: 'pro', name: 'V4 Pro' };
  }
  return null;
}

function normalizeUsage(amountData, costData) {
  const amountBiz = amountData?.data?.biz_data || {};
  const rawCostBiz = costData?.data?.biz_data;
  const costBiz = Array.isArray(rawCostBiz) ? (rawCostBiz[0] || {}) : (rawCostBiz || {});
  const costTotals = Array.isArray(costBiz.total) ? costBiz.total : [];

  const costForModel = (model) => {
    const label = modelLabel(model);
    const item = costTotals.find((entry) => {
      if (entry.model === model) return true;
      const entryLabel = modelLabel(entry.model);
      return label && entryLabel && entryLabel.key === label.key;
    });
    return item ? costSum(item.usage) : 0;
  };

  const modelMap = new Map([
    ['flash', { key: 'flash', name: 'V4 Flash', totalTokens: 0, requestCount: 0, cacheHitTokens: 0, cacheMissTokens: 0, responseTokens: 0, cost: 0 }],
    ['pro', { key: 'pro', name: 'V4 Pro', totalTokens: 0, requestCount: 0, cacheHitTokens: 0, cacheMissTokens: 0, responseTokens: 0, cost: 0 }]
  ]);
  for (const item of amountBiz.total || []) {
    const label = modelLabel(item.model);
    if (!label) continue;
    const parts = tokenBreakdown(item.usage);
    const row = modelMap.get(label.key);
    row.totalTokens += parts.totalTokens;
    row.requestCount += parts.requestCount;
    row.cacheHitTokens += parts.cacheHitTokens;
    row.cacheMissTokens += parts.cacheMissTokens;
    row.responseTokens += parts.responseTokens;
    row.cost += costForModel(item.model);
  }

  const costByDate = new Map();
  const costByDateModel = new Map();
  for (const day of costBiz.days || []) {
    const dayCost = (day.data || []).reduce((sum, item) => sum + costSum(item.usage), 0);
    costByDate.set(day.date, dayCost);
    for (const item of day.data || []) {
      const label = modelLabel(item.model);
      if (!label) continue;
      const key = `${day.date}:${label.key}`;
      costByDateModel.set(key, (costByDateModel.get(key) || 0) + costSum(item.usage));
    }
  }

  const days = [];
  for (const day of amountBiz.days || []) {
    const row = emptyUsageDay(day.date);
    for (const item of day.data || []) {
      const parts = tokenBreakdown(item.usage);
      row.totalTokens += parts.totalTokens;
      const label = modelLabel(item.model);
      if (label?.key === 'flash') {
        row.flashTokens += parts.totalTokens;
        row.flashCacheHit += parts.cacheHitTokens;
        row.flashCacheMiss += parts.cacheMissTokens;
        row.flashResponse += parts.responseTokens;
      } else if (label?.key === 'pro') {
        row.proTokens += parts.totalTokens;
        row.proCacheHit += parts.cacheHitTokens;
        row.proCacheMiss += parts.cacheMissTokens;
        row.proResponse += parts.responseTokens;
      }
    }
    row.totalCost = costByDate.get(day.date) || 0;
    days.push(row);
  }

  for (const row of modelMap.values()) {
    if (row.cost > 0 || row.totalTokens > 0) continue;
    row.cost = Array.from(costByDateModel.entries())
      .filter(([key]) => key.endsWith(`:${row.key}`))
      .reduce((sum, [, value]) => sum + value, 0);
  }

  const monthCostFromTotals = costTotals.reduce((sum, item) => sum + costSum(item.usage), 0);
  const monthCostFromDays = Array.from(costByDate.values()).reduce((sum, value) => sum + value, 0);

  return {
    models: Array.from(modelMap.values()),
    days,
    monthCost: monthCostFromTotals || monthCostFromDays,
    currency: costBiz.currency || null
  };
}

async function fetchUsageMonth(month, year) {
  const usageToken = getActiveUsageToken();
  if (!usageToken) {
    return { success: false, notConfigured: true, error: t('usage.tokenNotConfigured') };
  }

  const amountUrl = `https://platform.deepseek.com/api/v0/usage/amount?month=${month}&year=${year}`;
  const costUrl = `https://platform.deepseek.com/api/v0/usage/cost?month=${month}&year=${year}`;
  const [amount, cost] = await Promise.all([
    requestJsonUrl(amountUrl, usageToken),
    requestJsonUrl(costUrl, usageToken)
  ]);

  if (!amount.success) return { success: false, status: amount.status, code: amount.code, error: usageErrorFromResult(amount) };
  if (!cost.success) return { success: false, status: cost.status, code: cost.code, error: usageErrorFromResult(cost) };

  return { success: true, data: normalizeUsage(amount.data, cost.data) };
}

let usageSyncWindow = null;
let usageTokenCaptured = false;
let usageTokenCandidates = new Set();

async function verifyUsageTokenValue(token) {
  const now = new Date();
  const amountUrl = `https://platform.deepseek.com/api/v0/usage/amount?month=${now.getMonth() + 1}&year=${now.getFullYear()}`;
  const result = await requestJsonUrl(amountUrl, token);
  return result.success;
}

const USAGE_PLATFORM_ORIGIN = new URL(DEEPSEEK_PROVIDER.loginUrl).origin;

function isUsagePlatformUrl(url) {
  try {
    return new URL(url).origin === USAGE_PLATFORM_ORIGIN;
  } catch (e) {
    return false;
  }
}

function maybeCaptureUsageToken(authHeader) {
  const match = /Bearer\s+(\S+)/i.exec(String(authHeader || ''));
  const token = match?.[1]?.trim();
  if (!token || token.length < 20 || usageTokenCaptured) return;
  if (usageTokenCandidates.has(token)) return;
  usageTokenCandidates.add(token);

  verifyUsageTokenValue(token).then((valid) => {
    if (!valid || usageTokenCaptured) return;
    usageTokenCaptured = true;
    const account = ensureAccount();
    account.usageToken = token;
    saveConfig();

    if (mainWindow) {
      mainWindow.webContents.send('usage-token-captured', {
        usageTokenConfigured: true,
        hasUsageToken: true
      });
    }
    if (usageSyncWindow && !usageSyncWindow.isDestroyed()) usageSyncWindow.close();
    usageSyncWindow = null;
  }).catch(() => {});
}

function startUsageSyncWindow() {
  normalizeConfig();
  const provider = getActiveProvider();
  const loginUrl = provider.loginUrl;
  if (!loginUrl) return { success: false, error: t('err.noLoginUrl') };

  if (usageSyncWindow && !usageSyncWindow.isDestroyed()) {
    usageSyncWindow.show();
    usageSyncWindow.focus();
    usageSyncWindow.webContents.reload();
    return { success: true, opened: false };
  }

  usageTokenCaptured = false;
  usageTokenCandidates = new Set();
  usageSyncWindow = new BrowserWindow({
    width: 500,
    height: 720,
    minWidth: 380,
    minHeight: 520,
    title: t('login.windowTitle'),
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // Only DeepSeek platform requests are inspected, so bearer tokens of other
  // sites opened in this window (OAuth providers, third-party scripts) are never
  // picked up or sent anywhere.
  const syncSession = usageSyncWindow.webContents.session;
  const filter = { urls: [`${USAGE_PLATFORM_ORIGIN}/*`] };
  syncSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const headers = details.requestHeaders || {};
    const authHeader = headers.Authorization || headers.authorization;
    if (authHeader) maybeCaptureUsageToken(authHeader);
    callback({ requestHeaders: headers });
  });

  usageSyncWindow.webContents.on('did-finish-load', () => {
    if (!isUsagePlatformUrl(usageSyncWindow.webContents.getURL())) return;
    usageSyncWindow.webContents.executeJavaScript(`
      (() => {
        if (window.__dsmTokenHook) return;
        window.__dsmTokenHook = true;
        const send = (value) => {
          try {
            const match = /Bearer\\s+(\\S+)/i.exec(String(value || ''));
            if (match && match[1]) document.title = 'DSM_USAGE_TOKEN:' + match[1];
          } catch (_) {}
        };
        const originalFetch = window.fetch;
        if (typeof originalFetch === 'function') {
          window.fetch = function(input, init) {
            try {
              const headers = (init && init.headers) || (input && input.headers);
              if (headers instanceof Headers) send(headers.get('authorization'));
              else if (Array.isArray(headers)) headers.forEach((row) => String(row[0]).toLowerCase() === 'authorization' && send(row[1]));
              else if (headers && typeof headers === 'object') Object.keys(headers).forEach((key) => key.toLowerCase() === 'authorization' && send(headers[key]));
            } catch (_) {}
            return originalFetch.apply(this, arguments);
          };
        }
        const originalSet = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
          if (String(name || '').toLowerCase() === 'authorization') send(value);
          return originalSet.apply(this, arguments);
        };
      })();
    `).catch(() => {});
  });

  usageSyncWindow.on('page-title-updated', (event, title) => {
    if (!isUsagePlatformUrl(usageSyncWindow.webContents.getURL())) return;
    const token = String(title || '').replace(/^DSM_USAGE_TOKEN:/, '');
    if (title.startsWith('DSM_USAGE_TOKEN:')) maybeCaptureUsageToken(`Bearer ${token}`);
  });

  usageSyncWindow.on('closed', () => {
    syncSession.webRequest.onBeforeSendHeaders(null);
    if (!usageTokenCaptured && mainWindow) mainWindow.webContents.send('usage-sync-ended');
    usageSyncWindow = null;
  });

  usageSyncWindow.loadURL(loginUrl);
  return { success: true, opened: true };
}

// Get config
ipcMain.handle('get-config', () => {
  normalizeConfig();
  const account = getActiveAccount();
  return {
    accounts: config.accounts.map(safeAccount),
    activeAccountId: config.activeAccountId,
    autoLaunch: config.autoLaunch,
    autoRefreshEnabled: config.autoRefreshEnabled !== false,
    refreshIntervalSeconds: config.refreshIntervalSeconds || 300,
    budgetAlertEnabled: config.budgetAlertEnabled !== false,
    balanceThreshold: config.balanceThreshold || 50,
    alwaysOnTop: !!config.alwaysOnTop,
    alwaysOnTopBehavior: config.alwaysOnTopBehavior || 'none',
    alwaysOnTopOpacity: Number(config.alwaysOnTopOpacity) || 0.35,
    packaged: app.isPackaged,
    hasApiKey: !!(account && account.apiKey),
    hasUsageToken: !!(account && account.usageToken),
    configPath: configDir,
    language: config.language
  };
});

ipcMain.handle('save-language', (event, language) => {
  config.language = i18n.normalizeLanguage(language);
  saveConfig();
  if (tray) tray.setContextMenu(buildTrayMenu());
  if (usageSyncWindow && !usageSyncWindow.isDestroyed()) usageSyncWindow.setTitle(t('login.windowTitle'));
  return { success: true, language: config.language };
});

// Multi-account management
ipcMain.handle('add-account', (event, name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { success: false, error: t('err.accountNameEmpty') };
  const account = { id: crypto.randomUUID(), name: trimmed.slice(0, 30), apiKey: '', usageToken: '' };
  config.accounts.push(account);
  config.activeAccountId = account.id;
  saveConfig();
  return { success: true, account: safeAccount(account) };
});

ipcMain.handle('delete-account', (event, id) => {
  if (config.accounts.length <= 1) return { success: false, error: t('settings.accounts.keepOne') };
  const index = config.accounts.findIndex((a) => a.id === id);
  if (index < 0) return { success: false, error: t('err.accountNotFound') };
  config.accounts.splice(index, 1);
  if (config.activeAccountId === id) config.activeAccountId = config.accounts[0].id;
  delete config.budgetAlertState[id];
  saveConfig();
  return { success: true };
});

ipcMain.handle('set-active-account', (event, id) => {
  if (!config.accounts.some((a) => a.id === id)) return { success: false, error: t('err.accountNotFound') };
  config.activeAccountId = id;
  saveConfig();
  return { success: true };
});

// Save API key (active account)
ipcMain.handle('save-api-key', async (event, apiKey) => {
  const account = ensureAccount();
  account.apiKey = String(apiKey || '').trim();
  saveConfig();
  return { success: true };
});

// Save usage token (active account)
ipcMain.handle('save-usage-token', async (event, token) => {
  normalizeConfig();
  const value = String(token || '').trim();
  if (!value) return { success: false, error: t('err.tokenEmpty') };
  const valid = await verifyUsageTokenValue(value);
  if (!valid) return { success: false, error: t('err.tokenInvalid') };
  const account = ensureAccount();
  account.usageToken = value;
  saveConfig();
  return { success: true };
});

// Clear API key (active account)
ipcMain.handle('clear-api-key', () => {
  const account = ensureAccount();
  account.apiKey = '';
  saveConfig();
  return { success: true };
});

// Clear usage token (active account)
ipcMain.handle('clear-usage-token', () => {
  normalizeConfig();
  const account = ensureAccount();
  account.usageToken = '';
  saveConfig();
  return { success: true };
});

// Set auto launch
ipcMain.handle('set-auto-launch', (event, enabled) => {
  setAutoLaunch(enabled);
  return { success: true };
});

ipcMain.handle('save-refresh-options', (event, options = {}) => {
  config.autoRefreshEnabled = options.autoRefreshEnabled !== false;
  const seconds = Number(options.refreshIntervalSeconds || config.refreshIntervalSeconds || 300);
  config.refreshIntervalSeconds = [60, 300, 1800, 3600].includes(seconds) ? seconds : 300;
  saveConfig();
  return {
    success: true,
    autoRefreshEnabled: config.autoRefreshEnabled,
    refreshIntervalSeconds: config.refreshIntervalSeconds
  };
});

// Budget alert options
ipcMain.handle('save-budget-options', (event, options = {}) => {
  config.budgetAlertEnabled = options.budgetAlertEnabled !== false;
  const threshold = Number(options.balanceThreshold);
  config.balanceThreshold = Number.isFinite(threshold) && threshold >= 0 ? threshold : 50;
  saveConfig();
  return {
    success: true,
    budgetAlertEnabled: config.budgetAlertEnabled,
    balanceThreshold: config.balanceThreshold
  };
});

// Window options (always on top / hover behavior)
ipcMain.handle('save-window-options', (event, options = {}) => saveWindowOptions(options));

// Window controls
ipcMain.handle('window-minimize', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.handle('window-close', () => { if (mainWindow) mainWindow.hide(); });

// Verify API key
ipcMain.handle('verify-api-key', async (event, apiKey) => {
  const provider = { ...getActiveProvider(), apiKey: apiKey || getActiveProvider().apiKey };
  if (!provider.apiKey) return { success: false, error: 'No API key provided' };
  const result = await requestProvider(provider.balancePath || provider.modelsPath || '/models', { provider });
  return result.success ? { success: true } : result;
});

// Fetch balance
ipcMain.handle('fetch-balance', async () => {
  const provider = getActiveProvider();
  if (!provider.balancePath) return { success: false, unsupported: true, error: t('err.noBalanceApi') };
  if (!provider.apiKey) return { success: false, notConfigured: true, error: t('err.apiKeyNotConfigured') };
  const result = await requestProvider(provider.balancePath);
  if (!result.success) return result;
  const account = getActiveAccount();
  if (account) {
    const totals = getBalanceTotals(result.data);
    maybeAlertLowBalance(account, totals.primaryBalance, totals.currency);
  }
  return { ...result, data: normalizeBalance(result.data) };
});

// Fetch available models
ipcMain.handle('fetch-models', async () => {
  const provider = getActiveProvider();
  const result = await requestProvider(provider.modelsPath || '/models');
  if (!result.success) return result;
  return { ...result, models: normalizeModels(result.data) };
});

// Fetch usage data
ipcMain.handle('fetch-usage', async (event, params) => {
  const now = new Date();
  const month = Number(params?.month || now.getMonth() + 1);
  const year = Number(params?.year || now.getFullYear());
  return fetchUsageMonth(month, year);
});

// Open browser for web login
ipcMain.handle('open-browser-login', async () => {
  const provider = getActiveProvider();
  const target = provider.loginUrl || provider.baseUrl;
  if (!target) return { success: false, error: t('err.noLoginUrl') };
  await shell.openExternal(target);
  return { success: true };
});

ipcMain.handle('start-usage-sync', async () => startUsageSyncWindow());

// Auto update
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { success: false, error: t('update.devMode') };
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || t('update.checkFailed') };
  }
});

ipcMain.handle('quit-and-install-update', () => {
  autoUpdater.quitAndInstall();
  return { success: true };
});
