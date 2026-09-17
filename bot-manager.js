const EventEmitter = require('events');
const mineflayer = require('mineflayer');
// Anti-AFK hareket havuzu
const MOVES = ['jump', 'look', 'swing', 'sneak', 'strafe'];
const FOOD_ITEMS = new Set([
  'apple', 'baked_potato', 'beetroot', 'beetroot_soup', 'bread',
  'carrot', 'chorus_fruit', 'cooked_beef', 'cooked_chicken', 'cooked_cod',
  'cooked_mutton', 'cooked_porkchop', 'cooked_rabbit', 'cooked_salmon',
  'cookie', 'dried_kelp', 'golden_apple', 'enchanted_golden_apple',
  'glow_berries', 'melon_slice', 'mushroom_stew', 'poisonous_potato',
  'potato', 'pufferfish', 'pumpkin_pie', 'rabbit_stew', 'rotten_flesh',
  'spider_eye', 'sweet_berries', 'suspicious_stew', 'bread', 'honey_bottle'
]);

const ITEM_EMOJIS = {
  compass: '🧭', clock: '🕘', recovery_compass: '🧭', map: '🗺️',
  paper: '📜', book: '📖', writable_book: '📕', written_book: '📘',
  chest: '📦', ender_chest: '🟪', shulker_box: '🟪', hopper: '🔽',
  crafting_table: '🛠️', furnace: '🔥', anvil: '⚒️', diamond: '💎',
  emerald: '💚', gold_ingot: '🟨', iron_ingot: '⬜', coal: '⚫',
  stick: '🪵', sword: '⚔️', bow: '🏹', arrow: '➶', shield: '🛡️',
  pickaxe: '⛏️', axe: '🪓', shovel: '🛠️', hoe: '🌱',
  apple: '🍎', baked_potato: '🥔', beetroot: '🥬', beetroot_soup: '🍲',
  bread: '🍞', carrot: '🥕', chorus_fruit: '🟣', cooked_beef: '🥩',
  cooked_chicken: '🍗', cooked_cod: '🐟', cooked_mutton: '🍖',
  cooked_porkchop: '🥓', cooked_rabbit: '🍖', cooked_salmon: '🐟',
  cookie: '🍪', dried_kelp: '🌿', golden_apple: '🍏',
  enchanted_golden_apple: '✨🍎', glow_berries: '🫐', melon_slice: '🍉',
  mushroom_stew: '🍲', potato: '🥔', pumpkin_pie: '🥧', rabbit_stew: '🍲',
  rotten_flesh: '🥩', spider_eye: '👁️', sweet_berries: '🫐',
  suspicious_stew: '🍲', honey_bottle: '🍯', water_bucket: '🪣', lava_bucket: '🪣'
};

function itemEmoji(item) {
  if (!item) return '▫️';
  const name = String(item.name || '').toLowerCase();
  if (ITEM_EMOJIS[name]) return ITEM_EMOJIS[name];
  if (name.includes('sword')) return '⚔️';
  if (name.includes('pickaxe')) return '⛏️';
  if (name.includes('axe')) return '🪓';
  if (name.includes('shovel')) return '🛠️';
  if (name.includes('helmet')) return '🪖';
  if (name.includes('chestplate')) return '🛡️';
  if (name.includes('leggings')) return '👖';
  if (name.includes('boots')) return '🥾';
  if (name.includes('food') || FOOD_ITEMS.has(name)) return '🍖';
  return '📦';
}
// §-kodlu metne cevirmek icin; boylece arayuzdeki motdToHtml aynen calisir)
const COLOR_TO_CODE = {
  black: '0', dark_blue: '1', dark_green: '2', dark_aqua: '3',
  dark_red: '4', dark_purple: '5', gold: '6', gray: '7', grey: '7',
  dark_gray: '8', dark_grey: '8', blue: '9', green: 'a', aqua: 'b',
  red: 'c', light_purple: 'd', yellow: 'e', white: 'f'
};
// her zaman eski usul §-kodlu duz metne cevirir.
function textComponentToLegacy(raw) {
  if (raw == null) return '';
  // geliyor ve mineflayer bunu ZATEN cozulmus bir nesne olarak veriyor
  // String()/JSON.parse ikilisine hic girmeden dogrudan agaci geziyoruz).
  let node = raw;
  if (typeof raw === 'string') {
    try {
      node = JSON.parse(raw);
    } catch (e) {
      return raw; // zaten duz/legacy §-kodlu metin
    }
  } else if (typeof raw !== 'object') {
    return String(raw);
  }

  const walk = (n) => {
    if (n == null) return '';
    if (typeof n === 'string') return n;
    if (Array.isArray(n)) return n.map(walk).join('');

    let codes = '';
    if (n.color && COLOR_TO_CODE[n.color]) codes += '§' + COLOR_TO_CODE[n.color];
    if (n.bold) codes += '§l';
    if (n.italic) codes += '§o';
    if (n.underlined) codes += '§n';
    if (n.strikethrough) codes += '§m';
    if (n.obfuscated) codes += '§k';

    let out = codes + (n.text || n.translate || '');
    if (Array.isArray(n.extra)) out += n.extra.map(walk).join('');
    return out;
  };

  try {
    return walk(node) || (typeof raw === 'string' ? raw : '');
  } catch (e) {
    return typeof raw === 'string' ? raw : '';
  }
}
function itemLabel(item) {
  if (!item) return '';
  let custom = null;
  try { custom = item.customName; } catch (e) { }
  if (custom) return textComponentToLegacy(custom);
  const fallback = item.displayName || item.name || 'eşya';
  return textComponentToLegacy(fallback);
}
function serializeItem(item, slot) {
  if (!item) return { slot, empty: true };
  return {
    slot,
    empty: false,
    count: item.count,
    name: item.name || '',
    emoji: itemEmoji(item),
    food: FOOD_ITEMS.has(String(item.name || '').toLowerCase()),
    label: itemLabel(item)
  };
}

class BotManager extends EventEmitter {
  constructor() {
    super();
    this.bot = null;
    this.options = null;

    this.state = 'idle'; // idle | connecting | online | reconnecting
    this.manualStop = false;

    this.antiAfkEnabled = true;
    this.antiAfkInterval = 30; // saniye
    this.autoReconnect = true;
    this.reconnectDelay = 10; // saniye
    this.autoEatEnabled = true;
    this.eatBelow = 14;
    this.eating = false;
    this.eatCooldownTimer = null;

    this.antiAfkTimer = null;
    this.reconnectTimer = null;
    this.statsTimer = null;
    this.connectAttemptTimer = null;
    this.everConnectedThisSession = false;

    this.connectedAt = null;
    this.reconnectCount = 0;
    this.pulseCount = 0;
    this.lastPulseAt = null;

    this.currentWindowId = null;
    this.windowUpdateListener = null;
    this.windowEmitTimer = null;
  }

  connect(opts) {
    const reconnecting = this.state === 'reconnecting';
    if (this.bot) this.hardStop();
    clearTimeout(this.connectAttemptTimer);
    this.connectAttemptTimer = null;
    if (!reconnecting) this.everConnectedThisSession = false;

    this.options = {
      host: (opts.host || '').trim(),
      port: Number(opts.port) || 25565,
      username: (opts.username || '').trim(),
      version: opts.version && opts.version !== 'auto' ? opts.version : false,
      password: opts.password || null // sadece /login komutu icin, RAM'de
    };

    this.manualStop = false;
    this.setState('connecting');
    this.emit('system', {
      level: 'info',
      text: `${this.options.host}:${this.options.port} adresine bağlanılıyor...`
    });

    try {
      this.bot = mineflayer.createBot({
        host: this.options.host,
        port: this.options.port,
        username: this.options.username,
        auth: 'offline', // crack / offline-mode giris
        version: this.options.version,
        hideErrors: true,
        checkTimeoutInterval: 60 * 1000
      });
    } catch (err) {
      this.setState('idle');
      this.emit('system', { level: 'error', text: `Bağlantı kurulamadı: ${err.message}` });
      return;
    }

    this.bindEvents();
    // durumunda kalmasın. Mineflayer bağlantı/keep-alive tarafında hata
    // durumumuzu da tutuyoruz.
    const attemptBot = this.bot;
    this.connectAttemptTimer = setTimeout(() => {
      if (this.bot !== attemptBot || this.state !== 'connecting') return;
      this.emit('system', { level: 'error', text: 'Bağlantı zaman aşımına uğradı. Sunucu, internet veya sürüm yanıt vermiyor olabilir.' });
      this.manualStop = true;
      try { attemptBot.end(); } catch (e) { }
      this.bot = null;
      this.connectedAt = null;
      this.setState('idle');
    }, 35000);
  }

  bindEvents() {
    const bot = this.bot;

    bot.on('login', () => {
      this.emit('system', { level: 'ok', text: `Sunucuya giriş yapıldı: ${bot.username}` });
    });

    bot.once('spawn', () => {
      clearTimeout(this.connectAttemptTimer);
      this.connectAttemptTimer = null;
      this.everConnectedThisSession = true;
      this.connectedAt = Date.now();
      this.setState('online');
      this.emit('system', { level: 'ok', text: 'Dünyaya doğduk. Anti-AFK devrede.' });
      this.startAntiAfk();
      this.startStats();

      if (this.options.password) {
        setTimeout(() => {
          if (this.bot) {
            this.bot.chat(`/login ${this.options.password}`);
            this.emit('system', { level: 'info', text: 'Otomatik /login gönderildi.' });
          }
        }, 3000);
      }
    });

    bot.on('message', (jsonMsg) => {
      let motd = '';
      try {
        motd = typeof jsonMsg.toMotd === 'function' ? jsonMsg.toMotd() : String(jsonMsg);
      } catch (e) {
        motd = String(jsonMsg);
      }
      let plain = '';
      try {
        plain = typeof jsonMsg.toString === 'function' ? jsonMsg.toString() : motd;
      } catch (e) {
        plain = motd;
      }
      this.emit('chat', { motd, plain, at: Date.now() });
      this.checkUsernameMention(plain);
    });

    bot.on('health', () => {
      this.emit('vitals', {
        health: bot.health,
        food: bot.food
      });
      this.maybeAutoEat();
    });

    bot.on('death', () => {
      this.emit('alert', { kind: 'death', text: 'Karakter öldü; yeniden doğma deneniyor.' });
      setTimeout(() => {
        if (this.bot === bot && !this.manualStop) {
          try { bot.respawn(); } catch (e) { }
        }
      }, 800);
    });

    bot.on('windowOpen', (window) => this.handleWindowOpen(window));
    bot.on('windowClose', () => this.handleWindowClose());

    bot.on('kicked', (reason) => {
      const text = this.readReason(reason);
      this.emit('system', { level: 'error', text: `Sunucudan atıldık: ${text}` });
    });

    bot.on('error', (err) => {
      const msg = err && err.message ? err.message : String(err);
      this.emit('system', { level: 'error', text: `Hata: ${msg}` });
      // Gerçek bir bağlantı daha önce kurulduysa reconnect akışını end olayı yönetir.
      if (this.state === 'connecting' && !this.everConnectedThisSession) {
        clearTimeout(this.connectAttemptTimer);
        this.connectAttemptTimer = null;
        this.manualStop = true;
        try { bot.end(); } catch (e) { }
        if (this.bot === bot) this.bot = null;
        this.setState('idle');
      }
    });

    bot.on('end', (reason) => {
      clearTimeout(this.connectAttemptTimer);
      this.connectAttemptTimer = null;
      const text = this.readReason(reason);
      this.stopAntiAfk();
      this.stopStats();
      this.clearWindowState();
      this.bot = null;
      this.connectedAt = null;

      if (this.manualStop) {
        this.setState('idle');
        this.emit('system', { level: 'info', text: 'Bağlantı kapatıldı.' });
        return;
      }

      this.emit('system', { level: 'warn', text: `Sunucudan bağlantı kesildi${text ? ': ' + text : '.'}` });
      this.emit('alert', {
        kind: 'disconnect',
        text: 'Sunucu bağlantısı kesildi.',
        detail: text ? text.slice(0, 180) : 'Bağlantı sonlandı. İnternet veya sunucu kaynaklı olabilir.'
      });

      if (this.autoReconnect && this.everConnectedThisSession) {
        this.scheduleReconnect();
      } else {
        this.setState('idle');
      }
    });
  }

  readReason(reason) {
    if (!reason) return '';
    if (typeof reason === 'string') {
      try {
        const parsed = JSON.parse(reason);
        return this.flattenJsonText(parsed);
      } catch (e) {
        return reason;
      }
    }
    if (typeof reason.toString === 'function') return reason.toString();
    return this.flattenJsonText(reason);
  }

  flattenJsonText(node) {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    let out = node.text || node.translate || '';
    if (Array.isArray(node.extra)) {
      out += node.extra.map((n) => this.flattenJsonText(n)).join('');
    }
    if (Array.isArray(node.with)) {
      out += ' ' + node.with.map((n) => this.flattenJsonText(n)).join(' ');
    }
    return out;
  }

  checkUsernameMention(text) {
    if (!text || !this.bot || !this.bot.username) return;
    const name = String(this.bot.username).trim();
    if (!name) return;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hit = new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, 'i').test(text);
    if (!hit) return;
    this.emit('alert', {
      kind: 'mention',
      text: `${name} adlı kullanıcı sohbet içinde anıldı.`,
      detail: text.slice(0, 180)
    });
  }

  scheduleReconnect() {
    this.setState('reconnecting');
    let left = this.reconnectDelay;
    this.emit('reconnect-tick', left);

    clearInterval(this.reconnectTimer);
    this.reconnectTimer = setInterval(() => {
      left -= 1;
      this.emit('reconnect-tick', left);
      if (left <= 0) {
        clearInterval(this.reconnectTimer);
        this.reconnectTimer = null;
        this.reconnectCount += 1;
        this.emit('system', { level: 'info', text: `Yeniden bağlanılıyor (deneme #${this.reconnectCount})` });
        this.connect(this.options);
      }
    }, 1000);
  }

  startAntiAfk() {
    this.stopAntiAfk();
    if (!this.antiAfkEnabled) return;
    const ms = Math.max(5, this.antiAfkInterval) * 1000;
    this.antiAfkTimer = setInterval(() => this.pulse(), ms);
  }

  stopAntiAfk() {
    if (this.antiAfkTimer) clearInterval(this.antiAfkTimer);
    this.antiAfkTimer = null;
  }

  pulse() {
    const bot = this.bot;
    if (!bot || !bot.entity) return;
    const move = MOVES[Math.floor(Math.random() * MOVES.length)];

    try {
      switch (move) {
        case 'jump':
          bot.setControlState('jump', true);
          setTimeout(() => bot && bot.setControlState('jump', false), 350);
          break;
        case 'look': {
          const yaw = (Math.random() * Math.PI * 2) - Math.PI;
          const pitch = (Math.random() * 0.8) - 0.4;
          bot.look(yaw, pitch, true);
          break;
        }
        case 'swing':
          bot.swingArm('right');
          break;
        case 'sneak':
          bot.setControlState('sneak', true);
          setTimeout(() => bot && bot.setControlState('sneak', false), 500);
          break;
        case 'strafe': {
          const dir = Math.random() > 0.5 ? 'left' : 'right';
          bot.setControlState(dir, true);
          setTimeout(() => bot && bot.setControlState(dir, false), 300);
          break;
        }
      }
    } catch (e) {
    }

    this.pulseCount += 1;
    this.lastPulseAt = Date.now();
    this.emit('pulse', { move, count: this.pulseCount, at: this.lastPulseAt });
  }

  findFood() {
    const bot = this.bot;
    if (!bot || !bot.inventory || !Array.isArray(bot.inventory.slots)) return null;
    const foods = bot.inventory.slots.filter(Boolean).filter((item) =>
      FOOD_ITEMS.has(String(item.name || '').toLowerCase())
    );
    if (!foods.length) return null;
    foods.sort((a, b) => {
      const score = (x) => {
        const n = String(x.name || '').toLowerCase();
        if (n.startsWith('cooked_')) return 0;
        if (n === 'bread' || n === 'baked_potato') return 1;
        if (n === 'golden_apple' || n === 'enchanted_golden_apple') return 5;
        if (n === 'rotten_flesh' || n === 'spider_eye' || n === 'pufferfish') return 9;
        return 2;
      };
      return score(a) - score(b);
    });
    return foods[0];
  }

  async maybeAutoEat() {
    const bot = this.bot;
    if (!this.autoEatEnabled || !bot || !bot.entity || this.eating) return;
    if (typeof bot.food !== 'number' || bot.food > this.eatBelow) return;
    const food = this.findFood();
    if (!food) {
      if (!this.eatWarningShown) {
        this.eatWarningShown = true;
        this.emit('system', { level: 'warn', text: 'Açlık azaldı ama envanterde yenebilir yiyecek bulunamadı.' });
      }
      return;
    }
    this.eatWarningShown = false;
    this.eating = true;
    try {
      await bot.equip(food, 'hand');
      if (typeof bot.consume === 'function') {
        await bot.consume();
      } else {
        bot.activateItem();
        await new Promise((resolve) => setTimeout(resolve, 1600));
      }
      this.emit('system', { level: 'ok', text: `Otomatik yemek yendi: ${itemLabel(food)}` });
    } catch (err) {
      this.emit('system', { level: 'warn', text: `Otomatik yemek başarısız: ${err.message}` });
    } finally {
      this.eating = false;
    }
  }

  startStats() {
    this.stopStats();
    this.statsTimer = setInterval(() => {
      const bot = this.bot;
      if (!bot) return;
      let ping = null;
      try {
        const me = bot.players && bot.players[bot.username];
        ping = me && typeof me.ping === 'number' ? me.ping : null;
      } catch (e) { }

      this.emit('stats', {
        ping,
        players: bot.players ? Object.keys(bot.players).length : 0,
        health: typeof bot.health === 'number' ? bot.health : null,
        food: typeof bot.food === 'number' ? bot.food : null,
        uptime: this.connectedAt ? Date.now() - this.connectedAt : 0,
        pulses: this.pulseCount,
        reconnects: this.reconnectCount,
        position: bot.entity && bot.entity.position
          ? {
              x: Math.round(bot.entity.position.x),
              y: Math.round(bot.entity.position.y),
              z: Math.round(bot.entity.position.z)
            }
          : null
      });

      try {
        const start = bot.QUICK_BAR_START != null ? bot.QUICK_BAR_START : 36;
        const items = [];
        for (let i = 0; i < 9; i++) items.push(serializeItem(bot.inventory.slots[start + i], i));
        this.emit('hotbar', { items, selected: bot.quickBarSlot });
      } catch (e) { }
    }, 1000);
  }

  stopStats() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
  }

  say(text) {
    if (!this.bot) {
      this.emit('system', { level: 'warn', text: 'Bot bağlı değil, komut gönderilemedi.' });
      return false;
    }
    try {
      this.bot.chat(text);
      this.emit('outgoing', { text, at: Date.now() });
      return true;
    } catch (err) {
      this.emit('system', { level: 'error', text: `Komut gönderilemedi: ${err.message}` });
      return false;
    }
  }

  serializeWindow(win) {
    if (!win) return null;
    const slots = [];
    for (let i = 0; i < win.inventoryStart; i++) {
      slots.push(serializeItem(win.slots[i], i));
    }
    return {
      id: win.id,
      title: textComponentToLegacy(win.title) || 'Menü',
      slots
    };
  }

  handleWindowOpen(win) {
    this.currentWindowId = win.id;
    this.emit('window', this.serializeWindow(win));
    this.emit('system', { level: 'info', text: `Menü açıldı: ${textComponentToLegacy(win.title) || 'isimsiz'}` });
    // onay ekrani) - slotlar degistikce anlik guncelle.
    this.windowUpdateListener = () => {
      clearTimeout(this.windowEmitTimer);
      this.windowEmitTimer = setTimeout(() => {
        if (this.bot && this.bot.currentWindow && this.bot.currentWindow.id === win.id) {
          this.emit('window', this.serializeWindow(this.bot.currentWindow));
        }
      }, 120);
    };
    win.on('updateSlot', this.windowUpdateListener);
  }

  handleWindowClose() {
    this.clearWindowState();
    this.emit('window', null);
  }

  clearWindowState() {
    clearTimeout(this.windowEmitTimer);
    this.windowEmitTimer = null;
    this.currentWindowId = null;
    this.windowUpdateListener = null; // pencere nesnesiyle birlikte zaten dusuyor
  }

  selectHotbar(slot) {
    if (!this.bot) return false;
    if (typeof slot !== 'number' || slot < 0 || slot > 8) return false;
    try {
      this.bot.setQuickBarSlot(slot);
      return true;
    } catch (err) {
      this.emit('system', { level: 'error', text: `Hotbar slotu seçilemedi: ${err.message}` });
      return false;
    }
  }

  useItem() {
    if (!this.bot) return false;
    try {
      const held = this.bot.heldItem;
      this.bot.activateItem();
      this.emit('system', {
        level: 'info',
        text: held ? `Kullanıldı: ${itemLabel(held)}` : 'Elde eşya yokken kullanma denendi.'
      });
      return true;
    } catch (err) {
      this.emit('system', { level: 'error', text: `Eşya kullanılamadı: ${err.message}` });
      return false;
    }
  }

  async useCompass() {
    if (!this.bot) return false;
    try {
      const inv = this.bot.inventory;
      const compass = inv && inv.slots ? inv.slots.find((item) => item && String(item.name || '').toLowerCase() === 'compass') : null;
      if (!compass) {
        this.emit('system', { level: 'warn', text: 'Envanterde pusula bulunamadı.' });
        return false;
      }
      await this.bot.equip(compass, 'hand');
      this.bot.activateItem();
      this.emit('system', { level: 'ok', text: '🧭 Pusula bulundu ve kullanıldı.' });
      return true;
    } catch (err) {
      this.emit('system', { level: 'error', text: `Pusula kullanılamadı: ${err.message}` });
      return false;
    }
  }

  async clickSlot(slot) {
    if (!this.bot || !this.bot.currentWindow) {
      this.emit('system', { level: 'warn', text: 'Açık bir menü yok.' });
      return false;
    }
    try {
      await this.bot.simpleClick.leftMouse(slot);
      return true;
    } catch (err) {
      this.emit('system', { level: 'warn', text: `Tıklama sunucudan yanıt alamadı, tekrar dene (${err.message})` });
      return false;
    }
  }

  closeGui() {
    if (!this.bot || !this.bot.currentWindow) return false;
    try {
      this.bot.closeWindow(this.bot.currentWindow);
      return true;
    } catch (err) {
      return false;
    }
  }

  getSnapshotData() {
    const bot = this.bot;
    if (!bot || !bot.entity) return null;

    let nearby = [];
    try {
      const me = bot.entity.position;
      nearby = Object.values(bot.players || {})
        .filter((p) => p.username !== bot.username && p.entity && p.entity.position)
        .map((p) => ({ name: p.username, dist: Math.round(me.distanceTo(p.entity.position)) }))
        .filter((p) => p.dist <= 128)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 6);
    } catch (e) { }

    let heldItem = null;
    try { heldItem = bot.heldItem ? itemLabel(bot.heldItem) : null; } catch (e) { }

    return {
      username: bot.username,
      host: this.options ? `${this.options.host}:${this.options.port}` : '',
      health: typeof bot.health === 'number' ? bot.health : null,
      food: typeof bot.food === 'number' ? bot.food : null,
      position: bot.entity.position
        ? {
            x: Math.round(bot.entity.position.x),
            y: Math.round(bot.entity.position.y),
            z: Math.round(bot.entity.position.z)
          }
        : null,
      dimension: (bot.game && bot.game.dimension) || null,
      gameMode: (bot.game && bot.game.gameMode) || null,
      isDay: bot.time ? bot.time.isDay : null,
      day: bot.time ? bot.time.day : null,
      playersOnline: bot.players ? Object.keys(bot.players).length : 0,
      nearby,
      heldItem,
      uptime: this.connectedAt ? Date.now() - this.connectedAt : 0,
      pulses: this.pulseCount,
      takenAt: Date.now()
    };
  }

  applySettings(cfg) {
    if (typeof cfg.antiAfkEnabled === 'boolean') this.antiAfkEnabled = cfg.antiAfkEnabled;
    if (typeof cfg.antiAfkInterval === 'number') this.antiAfkInterval = cfg.antiAfkInterval;
    if (typeof cfg.autoReconnect === 'boolean') this.autoReconnect = cfg.autoReconnect;
    if (typeof cfg.reconnectDelay === 'number') this.reconnectDelay = cfg.reconnectDelay;
    if (typeof cfg.autoEatEnabled === 'boolean') this.autoEatEnabled = cfg.autoEatEnabled;
    if (typeof cfg.eatBelow === 'number') this.eatBelow = Math.max(1, Math.min(19, cfg.eatBelow));
    if (this.state === 'online') this.startAntiAfk();
  }

  disconnect() {
    this.manualStop = true;
    this.everConnectedThisSession = false;
    clearTimeout(this.connectAttemptTimer);
    this.connectAttemptTimer = null;
    clearInterval(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopAntiAfk();
    this.stopStats();
    this.clearWindowState();
    if (this.bot) {
      try { this.bot.quit('RCK AFK Bot kapatıldı'); } catch (e) { }
      this.bot = null;
    }
    this.setState('idle');
  }

  hardStop() {
    this.manualStop = true;
    clearTimeout(this.connectAttemptTimer);
    this.connectAttemptTimer = null;
    clearInterval(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopAntiAfk();
    this.stopStats();
    this.clearWindowState();
    if (this.bot) {
      try { this.bot.end(); } catch (e) { }
      this.bot = null;
    }
  }

  setState(s) {
    this.state = s;
    this.emit('state', s);
  }
}

module.exports = new BotManager();
