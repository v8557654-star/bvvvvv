// Простая JSON-БД (без нативных зависимостей).
// Хранит всё в data/orbit.json, автосохранение по дебаунсу.
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const FILE = path.join(dataDir, 'orbit.json');

const empty = {
  users: [],            // {id, username, display_name, password_hash, avatar, bio, status, last_seen, created_at}
  chats: [],            // {id, type, title, avatar, description, created_by, created_at}
  chat_members: [],     // {chat_id, user_id, role, joined_at, last_read_message_id, muted, pinned}
  messages: [],         // {id, chat_id, sender_id, reply_to, type, content, attachment, edited_at, deleted, created_at}
  reactions: [],        // {message_id, user_id, emoji}
  contacts: [],         // {user_id, contact_id, added_at}
  _seq: { users: 0, chats: 0, messages: 0 },
};

let data;
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const k of Object.keys(empty)) if (!(k in data)) data[k] = empty[k];
  for (const k of Object.keys(empty._seq)) if (!(k in data._seq)) data._seq[k] = 0;
} catch {
  data = JSON.parse(JSON.stringify(empty));
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(data));
    fs.renameSync(FILE + '.tmp', FILE);
  }, 80);
}
process.on('SIGINT', () => { clearTimeout(saveTimer); fs.writeFileSync(FILE, JSON.stringify(data)); process.exit(0); });

function nextId(table) { data._seq[table] = (data._seq[table] || 0) + 1; return data._seq[table]; }

// --- USERS ---
const users = {
  byId: (id) => data.users.find(u => u.id === id) || null,
  byUsername: (u) => data.users.find(x => x.username === u) || null,
  create: (row) => { row.id = nextId('users'); data.users.push(row); save(); return row; },
  update: (id, patch) => {
    const u = users.byId(id); if (!u) return null;
    Object.assign(u, patch); save(); return u;
  },
  search: (q, excludeId) => {
    const s = q.toLowerCase();
    return data.users.filter(u => u.id !== excludeId &&
      (u.username.toLowerCase().includes(s) || (u.display_name || '').toLowerCase().includes(s))).slice(0, 20);
  },
};

// --- CHATS ---
const chats = {
  byId: (id) => data.chats.find(c => c.id === id) || null,
  create: (row) => { row.id = nextId('chats'); data.chats.push(row); save(); return row; },
  findDirectBetween: (a, b) => {
    return data.chats.find(c => {
      if (c.type !== 'direct') return false;
      const m = data.chat_members.filter(x => x.chat_id === c.id).map(x => x.user_id).sort();
      return m.length === 2 && m.includes(a) && m.includes(b);
    }) || null;
  },
  findAiOf: (userId) => {
    return data.chats.find(c => c.type === 'ai' &&
      data.chat_members.some(m => m.chat_id === c.id && m.user_id === userId)) || null;
  },
  forUser: (userId) => {
    const memberRows = data.chat_members.filter(m => m.user_id === userId);
    return memberRows.map(m => {
      const c = chats.byId(m.chat_id);
      return c ? { ...c, muted: m.muted, pinned: m.pinned, last_read_message_id: m.last_read_message_id } : null;
    }).filter(Boolean);
  },
};

// --- MEMBERS ---
const members = {
  add: (chat_id, user_id, role = 'member') => {
    if (data.chat_members.some(m => m.chat_id === chat_id && m.user_id === user_id)) return;
    data.chat_members.push({ chat_id, user_id, role, joined_at: Date.now(), last_read_message_id: 0, muted: 0, pinned: 0 });
    save();
  },
  get: (chat_id, user_id) => data.chat_members.find(m => m.chat_id === chat_id && m.user_id === user_id) || null,
  forChat: (chat_id) => data.chat_members.filter(m => m.chat_id === chat_id),
  updateLastRead: (chat_id, user_id, msgId) => {
    const m = members.get(chat_id, user_id);
    if (m && msgId > (m.last_read_message_id || 0)) { m.last_read_message_id = msgId; save(); }
  },
  commonPeers: (userId) => {
    const myChats = data.chat_members.filter(m => m.user_id === userId).map(m => m.chat_id);
    const peers = new Set();
    for (const m of data.chat_members) {
      if (m.user_id !== userId && myChats.includes(m.chat_id)) peers.add(m.user_id);
    }
    return [...peers];
  },
};

// --- MESSAGES ---
const messages = {
  create: (row) => { row.id = nextId('messages'); row.deleted = 0; data.messages.push(row); save(); return row; },
  byId: (id) => data.messages.find(m => m.id === id) || null,
  forChat: (chat_id, before, limit) => {
    let list = data.messages.filter(m => m.chat_id === chat_id);
    if (before) list = list.filter(m => m.id < before);
    return list.slice(-limit);
  },
  lastForChat: (chat_id) => {
    const list = data.messages.filter(m => m.chat_id === chat_id && !m.deleted);
    return list.length ? list[list.length - 1] : null;
  },
  unreadCount: (chat_id, lastReadId, userId) => {
    return data.messages.filter(m => m.chat_id === chat_id && m.id > (lastReadId || 0)
      && m.sender_id !== userId && !m.deleted).length;
  },
  update: (id, patch) => {
    const m = messages.byId(id); if (!m) return null;
    Object.assign(m, patch); save(); return m;
  },
  recent: (chat_id, n) => {
    const list = data.messages.filter(m => m.chat_id === chat_id);
    return list.slice(-n);
  },
};

// --- REACTIONS ---
const reactions = {
  toggle: (message_id, user_id, emoji) => {
    const idx = data.reactions.findIndex(r => r.message_id === message_id && r.user_id === user_id && r.emoji === emoji);
    if (idx >= 0) data.reactions.splice(idx, 1);
    else data.reactions.push({ message_id, user_id, emoji });
    save();
  },
  forMessage: (message_id) => {
    const map = {};
    for (const r of data.reactions) {
      if (r.message_id !== message_id) continue;
      map[r.emoji] = (map[r.emoji] || 0) + 1;
    }
    return Object.entries(map).map(([emoji, n]) => ({ emoji, n }));
  },
};

module.exports = { users, chats, members, messages, reactions, _data: data, _save: save };
