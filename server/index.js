const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { WebSocketServer } = require('ws');

const db = require('./db');
const ai = require('./ai');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'orbit-dev-secret-change-me';

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- uploads ----------
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-z0-9_.\-]/gi, '_');
    cb(null, Date.now() + '_' + safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });
app.use('/uploads', express.static(uploadDir));

// ---------- helpers ----------
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Bad token' }); }
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, display_name: u.display_name,
    avatar: u.avatar, bio: u.bio, status: u.status, last_seen: u.last_seen,
  };
}

function ensureAiChat(userId) {
  const existing = db.chats.findAiOf(userId);
  if (existing) return existing;
  const now = Date.now();
  const chat = db.chats.create({
    type: 'ai', title: 'Orbit AI', avatar: '🤖',
    description: 'Ваш персональный AI-ассистент',
    created_by: userId, created_at: now,
  });
  db.members.add(chat.id, userId, 'owner');
  db.messages.create({
    chat_id: chat.id, sender_id: null, reply_to: null,
    type: 'ai', attachment: null,
    content: '👋 Привет! Я Orbit AI. Напишите /help, чтобы увидеть, что я умею.',
    created_at: now,
  });
  return chat;
}

function ensureFavoritesChat(userId) {
  const existing = (db._data.chats || []).find(c => c.type === 'favorites' &&
    db.members.get(c.id, userId));
  if (existing) return existing;
  const now = Date.now();
  const chat = db.chats.create({
    type: 'favorites', title: 'Избранное', avatar: '⭐',
    description: 'Сохранённые сообщения — видны только вам',
    created_by: userId, created_at: now,
  });
  db.members.add(chat.id, userId, 'owner');
  db.messages.create({
    chat_id: chat.id, sender_id: null, reply_to: null,
    type: 'system', attachment: null,
    content: 'Это ваше личное хранилище. Сохраняйте сюда заметки, ссылки и файлы.',
    created_at: now,
  });
  return chat;
}

// ---------- AUTH ----------
app.post('/api/register', (req, res) => {
  const { username, password, display_name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username и password обязательны' });
  if (username.length < 3 || password.length < 4) return res.status(400).json({ error: 'Слишком короткое имя или пароль' });
  const uname = username.toLowerCase();
  if (db.users.byUsername(uname)) return res.status(409).json({ error: 'Имя занято' });
  const hash = bcrypt.hashSync(password, 10);
  const avatars = ['🦊','🐼','🦁','🐯','🐸','🐙','🦄','🐧','🐵','🐺','🦉','🐲'];
  const avatar = avatars[Math.floor(Math.random() * avatars.length)];
  const now = Date.now();
  const user = db.users.create({
    username: uname, display_name: display_name || username, password_hash: hash,
    avatar, bio: '', status: 'online', last_seen: now, created_at: now,
  });
  ensureAiChat(user.id);
  ensureFavoritesChat(user.id);
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username и password обязательны' });
  const user = db.users.byUsername(username.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  db.users.update(user.id, { status: 'online', last_seen: Date.now() });
  ensureAiChat(user.id);
  ensureFavoritesChat(user.id);
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: publicUser(db.users.byId(req.user.id)) });
});

app.patch('/api/me', auth, (req, res) => {
  const { display_name, bio, avatar } = req.body || {};
  const patch = {};
  if (display_name !== undefined) patch.display_name = display_name;
  if (bio !== undefined) patch.bio = bio;
  if (avatar !== undefined) patch.avatar = avatar;
  const u = db.users.update(req.user.id, patch);
  res.json({ user: publicUser(u) });
});

// ---------- USERS ----------
app.get('/api/users/search', auth, (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json({ users: [] });
  res.json({ users: db.users.search(q, req.user.id).map(publicUser) });
});

// ---------- CHATS ----------
app.get('/api/chats', auth, (req, res) => {
  const list = db.chats.forUser(req.user.id);
  const enriched = list.map(c => {
    const last = db.messages.lastForChat(c.id);
    const unread = db.messages.unreadCount(c.id, c.last_read_message_id, req.user.id);
    let title = c.title, avatar = c.avatar, peer = null;
    if (c.type === 'direct') {
      const others = db.members.forChat(c.id).filter(m => m.user_id !== req.user.id);
      const other = others[0] ? db.users.byId(others[0].user_id) : null;
      if (other) { title = other.display_name; avatar = other.avatar; peer = publicUser(other); }
    }
    return { ...c, title, avatar, peer, last_message: last, unread };
  });
  enriched.sort((a, b) => {
    if (a.pinned !== b.pinned) return (b.pinned || 0) - (a.pinned || 0);
    const ta = a.last_message?.created_at || a.created_at;
    const tb = b.last_message?.created_at || b.created_at;
    return tb - ta;
  });
  res.json({ chats: enriched });
});

app.post('/api/chats/direct', auth, (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id || user_id === req.user.id) return res.status(400).json({ error: 'Bad user' });
  const existing = db.chats.findDirectBetween(req.user.id, user_id);
  if (existing) return res.json({ chat_id: existing.id });
  const now = Date.now();
  const chat = db.chats.create({ type: 'direct', title: null, avatar: null, description: null, created_by: req.user.id, created_at: now });
  db.members.add(chat.id, req.user.id);
  db.members.add(chat.id, user_id);
  res.json({ chat_id: chat.id });
});

app.post('/api/chats/group', auth, (req, res) => {
  const { title, type = 'group', member_ids = [], description = '', avatar = '👥' } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!['group', 'channel'].includes(type)) return res.status(400).json({ error: 'bad type' });
  const now = Date.now();
  const chat = db.chats.create({ type, title, avatar, description, created_by: req.user.id, created_at: now });
  db.members.add(chat.id, req.user.id, 'owner');
  for (const uid of member_ids) if (uid !== req.user.id) db.members.add(chat.id, uid);
  db.messages.create({
    chat_id: chat.id, sender_id: null, reply_to: null,
    type: 'system', attachment: null,
    content: `Чат "${title}" создан`, created_at: now,
  });
  res.json({ chat_id: chat.id });
});

app.get('/api/chats/:id/messages', auth, (req, res) => {
  const chatId = +req.params.id;
  const member = db.members.get(chatId, req.user.id);
  if (!member) return res.status(403).json({ error: 'not a member' });
  const before = +req.query.before || 0;
  const limit = Math.min(+req.query.limit || 50, 200);
  const rows = db.messages.forChat(chatId, before, limit);
  const result = rows.map(m => {
    const sender = m.sender_id ? db.users.byId(m.sender_id) : null;
    return {
      ...m,
      sender_name: sender ? sender.display_name : (m.type === 'ai' ? 'Orbit AI' : null),
      sender_avatar: sender ? sender.avatar : (m.type === 'ai' ? '🤖' : null),
      sender_username: sender ? sender.username : null,
      reactions: db.reactions.forMessage(m.id),
    };
  });
  const lastId = result.length ? result[result.length - 1].id : member.last_read_message_id;
  db.members.updateLastRead(chatId, req.user.id, lastId);
  res.json({ messages: result });
});

app.get('/api/chats/:id/members', auth, (req, res) => {
  const chatId = +req.params.id;
  if (!db.members.get(chatId, req.user.id)) return res.status(403).json({ error: 'not a member' });
  const rows = db.members.forChat(chatId).map(m => {
    const u = db.users.byId(m.user_id);
    return u ? { ...publicUser(u), role: m.role, joined_at: m.joined_at } : null;
  }).filter(Boolean);
  res.json({ members: rows });
});

// ---------- UPLOAD ----------
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ url: '/uploads/' + req.file.filename, name: req.file.originalname, size: req.file.size, mime: req.file.mimetype });
});

// загрузка картинки-аватара — сохраняем url в users.avatar
app.post('/api/me/avatar', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'нужна картинка' });
  const url = '/uploads/' + req.file.filename;
  const u = db.users.update(req.user.id, { avatar: url });
  res.json({ user: publicUser(u) });
});

// pin / mute чата
app.patch('/api/chats/:id/membership', auth, (req, res) => {
  const chatId = +req.params.id;
  const m = db.members.get(chatId, req.user.id);
  if (!m) return res.status(403).json({ error: 'not a member' });
  const { pinned, muted } = req.body || {};
  if (pinned !== undefined) m.pinned = pinned ? 1 : 0;
  if (muted !== undefined) m.muted = muted ? 1 : 0;
  db._save();
  res.json({ ok: true, pinned: m.pinned, muted: m.muted });
});

// ---------- WEBSOCKET ----------
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map(); // userId -> Set<ws>

function send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch {} }
function broadcastToChat(chatId, payload, exceptUserId = null) {
  for (const m of db.members.forChat(chatId)) {
    if (m.user_id === exceptUserId) continue;
    const set = clients.get(m.user_id);
    if (!set) continue;
    for (const ws of set) send(ws, payload);
  }
}
function broadcastPresence(userId, status) {
  db.users.update(userId, { status, last_seen: Date.now() });
  for (const peerId of db.members.commonPeers(userId)) {
    const set = clients.get(peerId);
    if (!set) continue;
    for (const ws of set) send(ws, { type: 'presence', user_id: userId, status });
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const token = url.searchParams.get('token');
  let userId = null;
  try { userId = jwt.verify(token, JWT_SECRET).id; } catch { ws.close(); return; }

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(ws);
  broadcastPresence(userId, 'online');

  ws.on('message', (raw) => {
    let data; try { data = JSON.parse(raw); } catch { return; }

    if (data.type === 'message') {
      const { chat_id, content, reply_to, attachment, msg_type = 'text' } = data;
      if (!db.members.get(chat_id, userId)) return;
      const now = Date.now();
      const m = db.messages.create({
        chat_id, sender_id: userId, reply_to: reply_to || null,
        type: msg_type, content: content || '', attachment: attachment || null,
        created_at: now,
      });
      const sender = db.users.byId(userId);
      const message = {
        ...m,
        sender_name: sender.display_name, sender_avatar: sender.avatar, sender_username: sender.username,
        reactions: [],
      };
      broadcastToChat(chat_id, { type: 'message', message });

      const chat = db.chats.byId(chat_id);
      if (chat && chat.type === 'ai') {
        const recent = db.messages.recent(chat_id, 30).map(x => {
          const s = x.sender_id ? db.users.byId(x.sender_id) : null;
          return { ...x, sender_name: s ? s.display_name : 'AI' };
        });
        const reply = ai.handle(content || '', { messages: recent });
        setTimeout(() => {
          const t = Date.now();
          const r = db.messages.create({
            chat_id, sender_id: null, reply_to: null,
            type: 'ai', content: reply, attachment: null, created_at: t,
          });
          broadcastToChat(chat_id, {
            type: 'message',
            message: { ...r, sender_name: 'Orbit AI', sender_avatar: '🤖', reactions: [] },
          });
        }, 500 + Math.random() * 600);
      }
    }

    if (data.type === 'typing') {
      const sender = db.users.byId(userId);
      broadcastToChat(data.chat_id, { type: 'typing', chat_id: data.chat_id, user_id: userId, name: sender.display_name, typing: data.typing }, userId);
    }

    if (data.type === 'reaction') {
      const msg = db.messages.byId(data.message_id);
      if (!msg) return;
      db.reactions.toggle(data.message_id, userId, data.emoji);
      broadcastToChat(msg.chat_id, { type: 'reaction', message_id: data.message_id, reactions: db.reactions.forMessage(data.message_id) });
    }

    if (data.type === 'edit') {
      const msg = db.messages.byId(data.message_id);
      if (!msg || msg.sender_id !== userId) return;
      db.messages.update(data.message_id, { content: data.content, edited_at: Date.now() });
      broadcastToChat(msg.chat_id, { type: 'edit', message_id: data.message_id, content: data.content, edited_at: Date.now() });
    }

    if (data.type === 'delete') {
      const msg = db.messages.byId(data.message_id);
      if (!msg || msg.sender_id !== userId) return;
      db.messages.update(data.message_id, { deleted: 1, content: '' });
      broadcastToChat(msg.chat_id, { type: 'delete', message_id: data.message_id });
    }
  });

  ws.on('close', () => {
    const set = clients.get(userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) { clients.delete(userId); broadcastPresence(userId, 'offline'); }
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🛰  Orbit messenger running at http://localhost:${PORT}\n`);
});
