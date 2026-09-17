const { app, BrowserWindow, ipcMain, shell, Notification, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const bot = require('./bot-manager');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-features', 'HttpCache,MediaCache');
// NOT: disableHardwareAcceleration() kasitli olarak KULLANILMIYOR.
// GPU'yu tamamen kapatmak her seyi CPU/yazilimla ciziyor - arayuzde artik
// backdrop-filter (ayarlar paneli), daha fazla gradyan ve animasyon oldugu
// icin bu, dusuk sistemde performansi iyilestirmek yerine kotulestiriyordu.
// Chromium zaten bilinen bozuk/eski GPU surucculerini kendi kara listesine
// gore otomatik olarak yazilim moduna dusurur (ve gercekten cokerse kendi
// kendine yazilim moduna geri cekilir); bunu elle zorlamaya gerek yok.

let win = null;

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', () => {
    if (win && !win.isDestroyed()) win.webContents.send('app:update', { state: 'available' });
  });
  autoUpdater.on('update-downloaded', () => {
    if (win && !win.isDestroyed()) win.webContents.send('app:update', { state: 'downloaded' });
  });
  autoUpdater.on('error', () => {});
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
}
// bot arka planda bağlansa bile arayüz 'Bağlanıyor' durumunda kalabiliyordu.
const BOT_EVENTS = ['state','chat','outgoing','system','stats','vitals','pulse','reconnect-tick','alert','window','hotbar'];
BOT_EVENTS.forEach((eventName) => {
  bot.on(eventName, (payload) => {
    if (win && !win.isDestroyed()) win.webContents.send('bot:' + eventName, payload);
  });
});

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// "chromewebdata" hata sayfasi yerine markali ve ne yapilmasi gerektigini
function fatalPage(title, paragraphs) {
  if (!win || win.isDestroyed()) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>RCK AFK Bot</title>
<style>
  *{box-sizing:border-box} html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;background:#0b0710;
    color:#f5ecf6;font-family:'Segoe UI',system-ui,sans-serif;-webkit-app-region:drag;padding:24px}
  .box{max-width:480px;padding:26px 30px;border:1px solid rgba(255,122,184,.35);
    border-radius:18px;background:#19102a;box-shadow:0 20px 50px rgba(0,0,0,.5);
    -webkit-app-region:no-drag}
  h1{font-size:16px;color:#ffb3d9;margin:0 0 12px;display:flex;gap:9px;align-items:center;font-weight:700}
  h1 span{color:#ff7ab8}
  p{font-size:12.5px;line-height:1.65;color:#c9b8d6;margin:7px 0}
  code{background:#2b1a41;color:#ffc48f;padding:2px 7px;border-radius:6px;font-size:11.5px;
    word-break:break-all;user-select:text}
</style></head><body><div class="box">
  <h1><span>&#9829;</span>${escHtml(title)}</h1>
  ${paragraphs.join('')}
</div></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

const SNAP_W = 760;
const SNAP_H = 860;

function stripCodes(s) { return String(s || '').replace(/§./g, ''); }

function screenshotsDir() {
  const base = app.isPackaged ? path.dirname(process.execPath) : __dirname;
  return path.join(base, 'screenshots');
}

const DIMENSION_LABEL = { overworld: 'Üst Dünya', the_nether: 'Nether', the_end: 'End' };

function buildSnapshotHtml(d) {
  const stampStr = new Date(d.takenAt).toLocaleString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const coordStr = d.position ? `X ${d.position.x}   Y ${d.position.y}   Z ${d.position.z}` : 'konum bilinmiyor';
  const healthStr = typeof d.health === 'number' ? `${Math.round(d.health)}/20` : '—';
  const foodStr = typeof d.food === 'number' ? `${Math.round(d.food)}/20` : '—';
  const dimStr = DIMENSION_LABEL[d.dimension] || '—';
  const dayIcon = d.isDay == null ? '' : d.isDay ? '&#9728;' : '&#9789;';
  const dayLabel = d.isDay == null ? 'bilinmiyor' : d.isDay ? 'Gündüz' : 'Gece';
  const dayPill = `${dayIcon} ${dayLabel}${d.day != null ? ' · ' + d.day + '. gün' : ''}`;

  const t = Math.floor((d.uptime || 0) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const uptimeStr = `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;

  const nearbyHtml = d.nearby && d.nearby.length
    ? `<div class="nearby"><h4>YAKINDAKİLER</h4>${d.nearby.map((p) =>
        `<span class="chip">${escHtml(p.name)} · ${p.dist}m</span>`).join('')}</div>`
    : '';
  const heldHtml = d.heldItem
    ? `<div class="nearby"><h4>ELİNDE</h4><span class="chip">${escHtml(stripCodes(d.heldItem))}</span></div>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${SNAP_W}px;height:${SNAP_H}px;font-family:'Segoe UI',system-ui,sans-serif;
    background:radial-gradient(120% 100% at 22% 0%,#2b1a41,#0a0610 72%);
    color:#f5ecf6;overflow:hidden}
  .wrap{padding:40px;height:100%;display:flex;flex-direction:column;gap:20px}
  .top{display:flex;justify-content:space-between;align-items:center}
  .brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:19px;color:#ffb3d9}
  .stamp{font-size:12.5px;color:#6d5c80;font-family:Consolas,monospace}
  .hero{background:rgba(255,255,255,.03);border:1px solid rgba(255,160,214,.18);
    border-radius:24px;padding:28px 32px}
  .username{font-size:38px;font-weight:800;background:linear-gradient(92deg,#ffb3d9,#b088ff);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .host{font-size:14px;color:#a794b8;font-family:Consolas,monospace;margin-top:4px}
  .daynight{margin-top:14px;display:inline-flex;align-items:center;gap:7px;
    background:rgba(0,0,0,.25);border-radius:999px;padding:7px 16px;
    font-size:13px;color:#ffc48f}
  .coords{background:rgba(10,6,16,.5);border-radius:18px;padding:16px 20px;
    font-family:Consolas,monospace;font-size:20px;color:#7ef0c8;text-align:center;letter-spacing:1px}
  .grid,.row{display:flex;gap:14px}
  .stat{flex:1;background:rgba(43,26,65,.5);border:1px solid rgba(255,160,214,.12);
    border-radius:16px;padding:14px 16px}
  .stat b{display:block;font-size:24px;font-weight:800}
  .stat span{font-size:11px;color:#a794b8;font-weight:700;letter-spacing:.3px}
  .nearby{background:rgba(43,26,65,.4);border-radius:16px;padding:14px 18px}
  .nearby h4{font-size:11px;color:#ffb3d9;margin-bottom:8px;font-weight:800;letter-spacing:.3px}
  .chip{display:inline-block;background:rgba(255,122,184,.14);color:#ffb3d9;
    border-radius:999px;padding:5px 12px;font-size:12px;margin:2px 4px 2px 0}
  .footer{margin-top:auto;text-align:center;font-size:11.5px;color:#6d5c80}
</style></head><body><div class="wrap">
  <div class="top">
    <div class="brand"><span style="color:#ff7ab8">&#9829;</span> RCK AFK Bot</div>
    <div class="stamp">${escHtml(stampStr)}</div>
  </div>
  <div class="hero">
    <div class="username">${escHtml(d.username)}</div>
    <div class="host">${escHtml(d.host)}</div>
    <div class="daynight">${dayPill}</div>
  </div>
  <div class="coords">${coordStr}</div>
  <div class="grid">
    <div class="stat"><b>${healthStr}</b><span>CAN</span></div>
    <div class="stat"><b>${foodStr}</b><span>AÇLIK</span></div>
    <div class="stat"><b>${dimStr}</b><span>BOYUT</span></div>
  </div>
  <div class="row">
    <div class="stat"><b>${uptimeStr}</b><span>ÇALIŞMA SÜRESİ</span></div>
    <div class="stat"><b>${d.pulses}</b><span>NABIZ</span></div>
    <div class="stat"><b>${d.playersOnline}</b><span>ÇEVRİMİÇİ</span></div>
  </div>
  ${nearbyHtml}
  ${heldHtml}
  <div class="footer">RCK AFK Bot ile alındı</div>
</div></body></html>`;
}

async function renderSnapshotImage(html) {
  const shot = new BrowserWindow({
    width: SNAP_W, height: SNAP_H, show: false, frame: false, useContentSize: true
  });
  try {
    await shot.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((resolve) => setTimeout(resolve, 150));
    return await shot.webContents.capturePage();
  } finally {
    shot.destroy();
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    backgroundColor: '#0b0710',
    show: false,
    title: 'RCK AFK Bot',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());

  const indexPath = path.join(__dirname, 'renderer', 'index.html');
  if (fs.existsSync(indexPath)) {
    win.loadFile(indexPath);
  } else {
    console.error('[RCK AFK Bot] index.html bulunamadı:', indexPath);
    fatalPage('Arayüz dosyaları eksik', [
      `<p><code>renderer/index.html</code> bulunamadı.</p>`,
      `<p>Aranan yol: <code>${escHtml(indexPath)}</code></p>`,
      `<p>Zip'i çıkardığın klasörü kontrol et — <code>main.js</code> ile <code>renderer</code> klasörü aynı dizinde olmalı.</p>`
    ]);
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // ERR_ABORTED genelde zararsız (hızlı yeniden yönlendirme)
    console.error('[RCK AFK Bot] Sayfa yüklenemedi:', code, desc, url);
    fatalPage('Sayfa yüklenemedi', [
      `<p>Hata kodu <code>${code}</code>: ${escHtml(desc)}</p>`,
      `<p>Adres: <code>${escHtml(url)}</code></p>`,
      `<p>Genelde dosyaların eksik ya da yanlış klasörde olduğu anlamına gelir. Zip'i olduğu gibi, klasör yapısını bozmadan çıkart ve içindeki klasörün içinden çalıştır.</p>`
    ]);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

function accountTokenPath(){ return path.join(app.getPath('userData'),'account-token.bin'); }
function localDataPath(name){ return path.join(app.getPath('userData'), name); }
function readJsonFile(name, fallback){
  try { const f=localDataPath(name); if(!fs.existsSync(f)) return fallback; return JSON.parse(fs.readFileSync(f,'utf8')); }
  catch { return fallback; }
}
function writeJsonFile(name, data){
  const f=localDataPath(name); fs.mkdirSync(path.dirname(f), {recursive:true});
  fs.writeFileSync(f, JSON.stringify(data,null,2), 'utf8');
}
function encryptLocalSecret(value){
  if (!value) return null;
  try {
    return safeStorage.isEncryptionAvailable()
      ? { encrypted:true, value:safeStorage.encryptString(String(value)).toString('base64') }
      : { encrypted:false, value:String(value) };
  } catch { return null; }
}
function decryptLocalSecret(obj){
  if (!obj || !obj.value) return '';
  try {
    return obj.encrypted && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(Buffer.from(obj.value,'base64'))
      : String(obj.value);
  } catch { return ''; }
}

ipcMain.handle('account:get-token', () => { try { const f=accountTokenPath(); if(!fs.existsSync(f)) return null; const raw=fs.readFileSync(f); return safeStorage.isEncryptionAvailable()?safeStorage.decryptString(raw):raw.toString('utf8'); } catch { return null; } });
ipcMain.handle('account:set-token', (_e, token) => { try { const raw=safeStorage.isEncryptionAvailable()?safeStorage.encryptString(String(token)):Buffer.from(String(token),'utf8'); fs.writeFileSync(accountTokenPath(), raw); return true; } catch { return false; } });
ipcMain.handle('account:clear-token', () => { try { fs.rmSync(accountTokenPath(), {force:true}); return true; } catch { return false; } });
// Electron'un userData alaninda tutulur. Sifreler yalnizca kullanici acikca isterse
ipcMain.handle('local:get-data', (_e, name) => {
  const allowed = new Set(['rck-settings.json','rck-profiles.json']);
  if (!allowed.has(name)) return null;
  const data = readJsonFile(name, {});
  if (name === 'rck-profiles.json') {
    data.profiles = Array.isArray(data.profiles) ? data.profiles.map(p => ({...p, password: decryptLocalSecret(p.passwordSecret)})) : [];
  }
  return data;
});
ipcMain.handle('local:save-data', (_e, name, data) => {
  const allowed = new Set(['rck-settings.json','rck-profiles.json']);
  if (!allowed.has(name) || !data || typeof data !== 'object') return false;
  try {
    if (name === 'rck-profiles.json') {
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      const safeProfiles = profiles.map(p => {
        const copy = {...p};
        const password = copy.password || '';
        const rememberPassword = !!copy.rememberPassword;
        delete copy.password;
        delete copy.passwordSecret;
        copy.passwordSecret = rememberPassword ? encryptLocalSecret(password) : null;
        copy.rememberPassword = rememberPassword;
        return copy;
      });
      writeJsonFile(name, {profiles:safeProfiles});
    } else {
      writeJsonFile(name, data);
    }
    return true;
  } catch { return false; }
});

ipcMain.handle('app:connect', (_e, opts) => { bot.connect(opts); return true; });
ipcMain.handle('app:disconnect', () => { bot.disconnect(); return true; });
ipcMain.handle('app:say', (_e, text) => bot.say(text));
ipcMain.handle('app:settings', (_e, cfg) => { bot.applySettings(cfg); return true; });
ipcMain.handle('app:open-url', (_e, url) => { shell.openExternal(url); return true; });
ipcMain.handle('app:select-hotbar', (_e, slot) => bot.selectHotbar(slot));
ipcMain.handle('app:use-item', () => bot.useItem());
ipcMain.handle('app:use-compass', () => bot.useCompass());
ipcMain.handle('app:click-slot', (_e, slot) => bot.clickSlot(slot));
ipcMain.handle('app:close-gui', () => bot.closeGui());

ipcMain.handle('app:screenshot', async () => {
  const data = bot.getSnapshotData();
  if (!data) return { ok: false, reason: 'not-connected' };

  try {
    const dir = screenshotsDir();
    fs.mkdirSync(dir, { recursive: true });

    const image = await renderSnapshotImage(buildSnapshotHtml(data));

    const p = (n) => String(n).padStart(2, '0');
    const t = new Date();
    const stamp = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}_${p(t.getHours())}-${p(t.getMinutes())}-${p(t.getSeconds())}`;
    const filename = `rck-ekran-goruntusu-${stamp}.png`;
    const fullPath = path.join(dir, filename);

    await fs.promises.writeFile(fullPath, image.toPNG());

    return { ok: true, path: fullPath, filename, dataUrl: image.toDataURL() };
  } catch (err) {
    return { ok: false, reason: 'error', message: err.message };
  }
});

ipcMain.handle('app:open-screenshots', () => {
  fs.mkdirSync(screenshotsDir(), { recursive: true });
  shell.openPath(screenshotsDir());
});

ipcMain.handle('win:minimize', () => { if (win) win.minimize(); });
ipcMain.handle('win:maximize', () => {
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
  return win.isMaximized();
});
ipcMain.handle('win:close', () => { if (win) win.close(); });

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async () => {
  bot.hardStop();
  try {
    const { session } = require('electron');
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'caches', 'indexdb', 'websql', 'serviceworkers']
    });
    await session.defaultSession.clearCache();
  } catch (e) { }
});

app.on('window-all-closed', () => {
  bot.hardStop();
  if (process.platform !== 'darwin') app.quit();
});
