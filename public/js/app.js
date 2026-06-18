// ============ ORBIT MESSENGER — Frontend ============
const $ = (id) => document.getElementById(id);

// ============ STATE ============
const state = {
  token: localStorage.getItem('orbit_token') || null,
  user: null,
  chats: [],
  activeChatId: null,
  messages: [],
  ws: null,
  typingTimers: {},
  typingShown: {},
  replyTo: null,
  presence: {},
};

// ============ SETTINGS (persisted in localStorage) ============
const DEFAULT_SETTINGS = {
  theme: 'dark',
  accent: '#5288c1',
  accent2: '#64baf0',
  fontSize: 'normal',
  wallpaper: 'pattern1',
  customWallpaper: null,
  sendOnEnter: true,
  sounds: true,
  showAvatars: true,
  bubbleStyle: 'rounded',
};
const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('orbit_settings') || '{}') };
function saveSettings() { localStorage.setItem('orbit_settings', JSON.stringify(settings)); applySettings(); }

const THEMES = [
  { id: 'dark',   name: 'Тёмная',   bg: '#0e1621', bubble: '#1a2733', out: '#5288c1' },
  { id: 'light',  name: 'Светлая',  bg: '#f0f2f5', bubble: '#ffffff', out: '#5288c1' },
  { id: 'amoled', name: 'AMOLED',   bg: '#000000', bubble: '#141414', out: '#5288c1' },
  { id: 'ocean',  name: 'Океан',    bg: '#0a1929', bubble: '#15334d', out: '#0077b6' },
  { id: 'sunset', name: 'Закат',    bg: '#1a0f1f', bubble: '#2e1e35', out: '#ff6b6b' },
  { id: 'forest', name: 'Лес',      bg: '#0d1f17', bubble: '#18382a', out: '#27ae60' },
];

const ACCENTS = [
  { c: '#5288c1', c2: '#64baf0', name: 'Синий' },
  { c: '#9c27b0', c2: '#ce93d8', name: 'Фиолет' },
  { c: '#e91e63', c2: '#f48fb1', name: 'Розовый' },
  { c: '#ff5722', c2: '#ff8a65', name: 'Оранж' },
  { c: '#4caf50', c2: '#81c784', name: 'Зелёный' },
  { c: '#009688', c2: '#4db6ac', name: 'Бирюза' },
  { c: '#ffc107', c2: '#ffd54f', name: 'Жёлтый' },
  { c: '#607d8b', c2: '#90a4ae', name: 'Стальной' },
];

const WALLPAPERS = [
  { id: 'none',     name: 'Без обоев',  preview: 'linear-gradient(135deg,#2a2a2a,#1a1a1a)', css: 'none' },
  { id: 'pattern1', name: 'Точки',      preview: 'radial-gradient(circle,#fff3 1.5px,transparent 2px) 0 0/16px 16px,#1e2c3a',
    css: 'radial-gradient(circle,var(--pattern-color) 1.5px,transparent 2px)', size: '16px 16px' },
  { id: 'pattern2', name: 'Клетка',     preview: 'repeating-linear-gradient(45deg,#fff2 0 1px,transparent 1px 12px),#1e2c3a',
    css: 'repeating-linear-gradient(45deg,var(--pattern-color) 0 1px,transparent 1px 12px),repeating-linear-gradient(-45deg,var(--pattern-color) 0 1px,transparent 1px 12px)' },
  { id: 'aurora',   name: 'Аврора',     preview: 'linear-gradient(135deg,#667eea,#764ba2,#f093fb)',
    css: 'linear-gradient(135deg,#667eea 0%,#764ba2 50%,#f093fb 100%)', overlay: 'rgba(0,0,0,0.5)' },
  { id: 'ocean',    name: 'Океан',      preview: 'linear-gradient(180deg,#2980b9,#6dd5fa)',
    css: 'linear-gradient(180deg,#2980b9,#6dd5fa,#ffffff)', overlay: 'rgba(0,0,0,0.55)' },
  { id: 'sunset',   name: 'Закат',      preview: 'linear-gradient(180deg,#fc4a1a,#f7b733)',
    css: 'linear-gradient(180deg,#fc4a1a,#f7b733)', overlay: 'rgba(0,0,0,0.55)' },
  { id: 'space',    name: 'Космос',     preview: 'radial-gradient(ellipse at top,#1e3a8a,#000)',
    css: 'radial-gradient(ellipse at top,#1e3a8a,#000)', overlay: 'rgba(0,0,0,0.3)' },
  { id: 'mint',     name: 'Мята',       preview: 'linear-gradient(135deg,#a8edea,#fed6e3)',
    css: 'linear-gradient(135deg,#a8edea,#fed6e3)', overlay: 'rgba(0,0,0,0.5)' },
  { id: 'matrix',   name: 'Матрица',    preview: 'repeating-linear-gradient(90deg,#0f0 0 1px,#000 1px 8px)',
    css: 'repeating-linear-gradient(90deg,rgba(0,255,0,0.05) 0 1px,transparent 1px 8px),#000', overlay: 'rgba(0,0,0,0.3)' },
];

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥','🎉','👏','🙏','💯','😍','🤔','😎','🚀','✨','💪','👀','🥳','😴','🤖','🌟','💔','😭','🤯'];

function applySettings() {
  const html = document.documentElement;
  html.dataset.theme = settings.theme;
  html.dataset.fs = settings.fontSize;
  html.style.setProperty('--accent', settings.accent);
  html.style.setProperty('--accent-2', settings.accent2);

  // обои
  const wp = WALLPAPERS.find(w => w.id === settings.wallpaper) || WALLPAPERS[0];
  let bg = wp.css || 'none';
  if (settings.customWallpaper) bg = `url("${settings.customWallpaper}")`;
  html.style.setProperty('--chat-wallpaper', bg);
  if (wp.size) document.getElementById('main')?.style.setProperty('background-size', wp.size);
  html.style.setProperty('--chat-wallpaper-overlay', wp.overlay || (settings.customWallpaper ? 'rgba(0,0,0,0.4)' : 'transparent'));
}
applySettings();

// ============ API ============
const api = async (path, opts = {}) => {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    ...opts, headers,
    body: opts.body instanceof FormData ? opts.body :
          opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
};

// ============ AUTH ============
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    const w = btn.dataset.tab;
    $('loginForm').classList.toggle('hidden', w !== 'login');
    $('registerForm').classList.toggle('hidden', w !== 'register');
  };
});

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const d = await api('/api/login', { method: 'POST', body: Object.fromEntries(fd) });
    state.token = d.token; state.user = d.user;
    localStorage.setItem('orbit_token', d.token);
    enterApp();
  } catch (err) { $('loginErr').textContent = err.message; }
};

$('registerForm').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const d = await api('/api/register', { method: 'POST', body: Object.fromEntries(fd) });
    state.token = d.token; state.user = d.user;
    localStorage.setItem('orbit_token', d.token);
    enterApp();
  } catch (err) { $('registerErr').textContent = err.message; }
};

(async () => {
  if (state.token) {
    try {
      const d = await api('/api/me');
      state.user = d.user;
      enterApp();
    } catch {
      localStorage.removeItem('orbit_token');
      state.token = null;
    }
  }
})();

function enterApp() {
  $('auth').classList.add('hidden');
  $('app').classList.remove('hidden');
  renderMe();
  connectWS();
  loadChats();
}

function renderMe() {
  $('myName').textContent = state.user.display_name;
  renderAvatarInto($('myAvatar'), state.user);
}

function renderAvatarInto(el, user, classes = '') {
  if (classes) el.className = 'avatar ' + classes;
  const isUrl = user?.avatar && user.avatar.startsWith('/');
  if (isUrl) {
    el.style.backgroundImage = `url("${user.avatar}")`;
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = user?.avatar || '👤';
  }
}

// ============ WS ============
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}/ws?token=${state.token}`);
  state.ws.onmessage = (e) => handleWS(JSON.parse(e.data));
  state.ws.onclose = () => setTimeout(connectWS, 2000);
}
function wsSend(o) { if (state.ws?.readyState === 1) state.ws.send(JSON.stringify(o)); }

function handleWS(msg) {
  if (msg.type === 'message') {
    if (msg.message.chat_id === state.activeChatId) {
      state.messages.push(msg.message);
      renderMessages();
      scrollToBottom();
    }
    const chat = state.chats.find(c => c.id === msg.message.chat_id);
    if (chat) {
      chat.last_message = msg.message;
      if (msg.message.chat_id !== state.activeChatId && msg.message.sender_id !== state.user.id) {
        chat.unread = (chat.unread || 0) + 1;
        if (settings.sounds && !chat.muted) playPing();
      }
      renderChatList();
    } else loadChats();
  }
  if (msg.type === 'typing' && msg.chat_id === state.activeChatId) {
    if (msg.typing) state.typingShown[msg.user_id] = msg.name;
    else delete state.typingShown[msg.user_id];
    renderTyping();
  }
  if (msg.type === 'reaction') {
    const m = state.messages.find(x => x.id === msg.message_id);
    if (m) { m.reactions = msg.reactions; renderMessages(); }
  }
  if (msg.type === 'edit') {
    const m = state.messages.find(x => x.id === msg.message_id);
    if (m) { m.content = msg.content; m.edited_at = msg.edited_at; renderMessages(); }
  }
  if (msg.type === 'delete') {
    state.messages = state.messages.filter(x => x.id !== msg.message_id);
    renderMessages();
  }
  if (msg.type === 'presence') {
    state.presence[msg.user_id] = msg.status;
    renderChatList();
    if (state.activeChatId) renderChatHeader();
  }
}

// ============ CHATS ============
async function loadChats() {
  const d = await api('/api/chats');
  state.chats = d.chats;
  renderChatList();
}

function chatIcon(chat) {
  if (chat.type === 'ai') return '🤖';
  if (chat.type === 'favorites') return '⭐';
  if (chat.type === 'channel') return '📢';
  if (chat.type === 'group') return '👥';
  return chat.avatar || '👤';
}

function renderChatList(filter = '') {
  const list = $('chatList');
  list.innerHTML = '';
  const f = filter.toLowerCase();
  const items = state.chats.filter(c => !f || (c.title || '').toLowerCase().includes(f));
  for (const chat of items) {
    const el = document.createElement('div');
    el.className = 'chat-item' + (chat.id === state.activeChatId ? ' active' : '') + (chat.muted ? ' muted' : '');
    const last = chat.last_message;
    const preview = last ? (last.type === 'image' ? '🖼 Изображение' :
                            last.type === 'file' ? '📎 ' + (last.attachment?.name || 'Файл') :
                            last.type === 'system' ? last.content :
                            (last.sender_id === state.user.id ? 'Вы: ' : '') + (last.content || '').slice(0, 60)) : 'Нет сообщений';
    const time = last ? formatTime(last.created_at) : '';
    const isOnline = chat.peer && state.presence[chat.peer.id] === 'online';

    const ava = document.createElement('div');
    renderAvatarInto(ava, chat.type === 'direct' ? chat.peer : { avatar: chatIcon(chat) }, isOnline ? 'online' : '');

    el.innerHTML = `
      <div class="chat-item-body">
        <div class="chat-item-top">
          <div class="chat-item-name">
            ${chat.type === 'ai' ? '🤖 ' : chat.type === 'favorites' ? '⭐ ' : chat.type === 'channel' ? '📢 ' : ''}${escapeHtml(chat.title || 'Без названия')}
          </div>
          <div class="chat-item-time">${time}</div>
        </div>
        <div class="chat-item-bottom">
          <div class="chat-item-preview">${escapeHtml(preview)}</div>
          ${chat.muted ? '<span class="mute-icon">🔕</span>' : ''}
          ${chat.pinned ? '<span class="pin-icon">📌</span>' : ''}
          ${chat.unread > 0 ? `<span class="unread-badge">${chat.unread}</span>` : ''}
        </div>
      </div>
    `;
    el.prepend(ava);
    el.onclick = () => openChat(chat.id);
    el.oncontextmenu = (e) => { e.preventDefault(); chatContextMenu(e, chat); };
    list.appendChild(el);
  }
}

async function openChat(chatId) {
  state.activeChatId = chatId;
  state.replyTo = null; $('replyBar').classList.add('hidden');
  $('app').classList.add('chat-open');
  $('emptyState').classList.add('hidden');
  $('chatView').classList.remove('hidden');

  const chat = state.chats.find(c => c.id === chatId);
  if (chat) chat.unread = 0;
  renderChatList();
  renderChatHeader();

  const d = await api(`/api/chats/${chatId}/messages`);
  state.messages = d.messages;
  renderMessages();
  scrollToBottom();
  $('messageInput').focus();
}

function renderChatHeader() {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat) return;
  const headerAvatar = $('chatAvatar');
  renderAvatarInto(headerAvatar, chat.type === 'direct' ? chat.peer : { avatar: chatIcon(chat) });
  $('chatTitle').textContent = chat.title || 'Без названия';
  let subtitle = '';
  if (chat.type === 'direct' && chat.peer) subtitle = state.presence[chat.peer.id] === 'online' ? '🟢 в сети' : 'не в сети';
  else if (chat.type === 'group') subtitle = '👥 группа';
  else if (chat.type === 'channel') subtitle = '📢 канал';
  else if (chat.type === 'ai') subtitle = '🤖 AI-ассистент';
  else if (chat.type === 'favorites') subtitle = '⭐ ваши заметки';
  $('chatSubtitle').textContent = subtitle;
}

$('chatHeaderInfo').onclick = () => {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (chat) showChatInfo(chat);
};
$('chatInfoBtn').onclick = () => {
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (chat) showChatInfo(chat);
};

// ============ MESSAGES RENDER ============
function renderMessages() {
  const cont = $('messages');
  cont.innerHTML = '';
  let lastDate = null, lastSender = null;
  for (const m of state.messages) {
    const date = new Date(m.created_at).toDateString();
    if (date !== lastDate) {
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.innerHTML = `<span>${formatDate(m.created_at)}</span>`;
      cont.appendChild(sep);
      lastDate = date; lastSender = null;
    }
    if (m.type === 'system') {
      const el = document.createElement('div');
      el.className = 'system-message';
      el.innerHTML = `<span>${escapeHtml(m.content)}</span>`;
      cont.appendChild(el);
      lastSender = null;
      continue;
    }
    const own = m.sender_id === state.user.id;
    const grouped = lastSender === m.sender_id;
    const row = document.createElement('div');
    row.className = 'message-row' + (own ? ' own' : '') + (grouped ? ' grouped' : '');

    if (settings.showAvatars && !own) {
      const ava = document.createElement('div');
      renderAvatarInto(ava, { avatar: m.sender_avatar || (m.type === 'ai' ? '🤖' : '👤') }, 'small');
      row.appendChild(ava);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble' + (m.type === 'ai' ? ' ai-bubble' : '') + (grouped ? ' grouped-bubble' : '');

    const chat = state.chats.find(c => c.id === state.activeChatId);
    const showSender = !own && !grouped && chat && (chat.type === 'group' || chat.type === 'channel' || chat.type === 'ai');
    if (showSender) {
      const s = document.createElement('div');
      s.className = 'msg-sender';
      s.textContent = m.sender_name || (m.type === 'ai' ? 'Orbit AI' : 'Гость');
      bubble.appendChild(s);
    }

    if (m.reply_to) {
      const replied = state.messages.find(x => x.id === m.reply_to);
      if (replied) {
        const q = document.createElement('div');
        q.className = 'reply-quote';
        q.innerHTML = `<div class="reply-author">${escapeHtml(replied.sender_name || 'Аноним')}</div>
                       <div class="reply-snippet">${escapeHtml((replied.content || '[вложение]').slice(0,80))}</div>`;
        bubble.appendChild(q);
      }
    }

    if (m.attachment) {
      if (m.attachment.mime && m.attachment.mime.startsWith('image/')) {
        const img = document.createElement('img');
        img.className = 'attachment-image';
        img.src = m.attachment.url; img.loading = 'lazy';
        img.onclick = () => openImageViewer(m.attachment.url);
        bubble.appendChild(img);
      } else {
        const a = document.createElement('a');
        a.className = 'attachment-file';
        a.href = m.attachment.url; a.target = '_blank'; a.download = m.attachment.name;
        a.innerHTML = `<div class="file-icon">📄</div>
                       <div><div class="file-name">${escapeHtml(m.attachment.name)}</div>
                       <div class="file-size">${formatSize(m.attachment.size)}</div></div>`;
        bubble.appendChild(a);
      }
    }

    if (m.content) {
      const c = document.createElement('div');
      c.className = 'msg-content';
      c.innerHTML = formatContent(m.content);
      bubble.appendChild(c);
    }

    if (m.reactions && m.reactions.length) {
      const rx = document.createElement('div');
      rx.className = 'reactions';
      for (const r of m.reactions) {
        const b = document.createElement('span');
        b.className = 'reaction';
        b.textContent = `${r.emoji} ${r.n}`;
        b.onclick = () => wsSend({ type: 'reaction', message_id: m.id, emoji: r.emoji });
        rx.appendChild(b);
      }
      bubble.appendChild(rx);
    }

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    let t = formatTime(m.created_at);
    if (m.edited_at) t += ' · ред.';
    meta.textContent = t;
    bubble.appendChild(meta);

    // actions
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = `
      <button title="Ответить" data-act="reply">↩</button>
      <button title="Реакция" data-act="react">😊</button>
      <button title="В избранное" data-act="save">⭐</button>
      ${own ? '<button title="Редактировать" data-act="edit">✏️</button>' : ''}
      ${own ? '<button title="Удалить" data-act="delete">🗑</button>' : ''}
    `;
    actions.onclick = (e) => {
      const act = e.target.dataset.act;
      if (act === 'reply') {
        state.replyTo = m;
        $('replyBar').classList.remove('hidden');
        $('replyText').textContent = (m.sender_name ? m.sender_name + ': ' : '') + (m.content || '[вложение]').slice(0, 80);
        $('messageInput').focus();
      } else if (act === 'react') {
        showEmojiPickerFor(m.id);
      } else if (act === 'save') {
        saveToFavorites(m);
      } else if (act === 'edit') {
        const t = prompt('Редактировать:', m.content);
        if (t !== null && t !== m.content) wsSend({ type: 'edit', message_id: m.id, content: t });
      } else if (act === 'delete') {
        if (confirm('Удалить сообщение?')) wsSend({ type: 'delete', message_id: m.id });
      }
    };
    bubble.appendChild(actions);

    row.appendChild(bubble);
    cont.appendChild(row);
    lastSender = m.sender_id;
  }
}

function renderTyping() {
  const names = Object.values(state.typingShown);
  const el = $('typingIndicator');
  if (!names.length) { el.textContent = ''; return; }
  el.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span> ${escapeHtml(names.join(', '))} печата${names.length>1?'ют':'ет'}…`;
}

// ============ SAVE TO FAVORITES ============
async function saveToFavorites(msg) {
  const fav = state.chats.find(c => c.type === 'favorites');
  if (!fav) return toast('Избранное не найдено', 'error');
  wsSend({
    type: 'message', chat_id: fav.id,
    msg_type: msg.type === 'ai' ? 'text' : msg.type,
    content: msg.content ? `↪️ от ${msg.sender_name || 'Аноним'}:\n${msg.content}` : '',
    attachment: msg.attachment || null,
  });
  toast('⭐ Сохранено в Избранное', 'success');
}

// ============ COMPOSER ============
$('sendBtn').onclick = sendMessage;
$('messageInput').addEventListener('keydown', (e) => {
  if (settings.sendOnEnter && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  else if (state.activeChatId) {
    wsSend({ type: 'typing', chat_id: state.activeChatId, typing: true });
    clearTimeout(state.typingTimers.self);
    state.typingTimers.self = setTimeout(() => wsSend({ type: 'typing', chat_id: state.activeChatId, typing: false }), 2000);
  }
});
$('messageInput').addEventListener('input', autoResize);
function autoResize() { const t = $('messageInput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }

function sendMessage() {
  const t = $('messageInput');
  const txt = t.value.trim();
  if (!txt || !state.activeChatId) return;
  wsSend({ type: 'message', chat_id: state.activeChatId, content: txt, reply_to: state.replyTo?.id || null });
  t.value = ''; autoResize();
  state.replyTo = null; $('replyBar').classList.add('hidden');
  wsSend({ type: 'typing', chat_id: state.activeChatId, typing: false });
}
$('cancelReplyBtn').onclick = () => { state.replyTo = null; $('replyBar').classList.add('hidden'); };

// ============ ATTACHMENTS ============
$('attachBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || !state.activeChatId) return;
  const fd = new FormData(); fd.append('file', file);
  toast('Загрузка…');
  try {
    const att = await api('/api/upload', { method: 'POST', body: fd });
    const isImg = att.mime && att.mime.startsWith('image/');
    wsSend({ type: 'message', chat_id: state.activeChatId, msg_type: isImg ? 'image' : 'file', content: '', attachment: att });
  } catch { toast('Ошибка загрузки', 'error'); }
  e.target.value = '';
};

// ============ EMOJI ============
const emojiPanel = $('emojiPanel');
EMOJIS.forEach(em => {
  const b = document.createElement('button');
  b.textContent = em;
  b.onclick = () => {
    if (emojiPanel.dataset.for) {
      wsSend({ type: 'reaction', message_id: +emojiPanel.dataset.for, emoji: em });
      emojiPanel.dataset.for = '';
    } else {
      $('messageInput').value += em;
      $('messageInput').focus();
    }
    emojiPanel.classList.add('hidden');
  };
  emojiPanel.appendChild(b);
});
$('emojiBtn').onclick = () => { emojiPanel.dataset.for = ''; emojiPanel.classList.toggle('hidden'); };
function showEmojiPickerFor(id) { emojiPanel.dataset.for = id; emojiPanel.classList.remove('hidden'); }
document.addEventListener('click', (e) => {
  if (!emojiPanel.contains(e.target) && e.target.id !== 'emojiBtn' && !e.target.closest('.msg-actions')) {
    emojiPanel.classList.add('hidden');
  }
});

// ============ NEW CHAT ============
$('newChatBtn').onclick = () => openModal(`
  <h2>✨ Новый чат</h2>
  <button class="btn btn-primary" style="width:100%;margin-bottom:8px" id="newDirect">👤 Личное сообщение</button>
  <button class="btn" style="width:100%;margin-bottom:8px" id="newGroup">👥 Создать группу</button>
  <button class="btn" style="width:100%" id="newChannel">📢 Создать канал</button>
`, () => {
  $('newDirect').onclick = () => modalSearchUser();
  $('newGroup').onclick = () => modalCreateGroup('group');
  $('newChannel').onclick = () => modalCreateGroup('channel');
});

function modalSearchUser() {
  openModal(`
    <h2>🔍 Найти пользователя</h2>
    <input id="userSearch" placeholder="Имя или юзернейм..." autofocus />
    <div class="user-search-results" id="searchResults" style="margin-top:12px"></div>
  `, () => {
    $('userSearch').addEventListener('input', async (e) => {
      const q = e.target.value.trim();
      if (!q) { $('searchResults').innerHTML = ''; return; }
      const d = await api('/api/users/search?q=' + encodeURIComponent(q));
      $('searchResults').innerHTML = d.users.map(u => `
        <div class="user-result" data-id="${u.id}">
          <div class="avatar small" ${u.avatar?.startsWith('/')?`style="background-image:url('${u.avatar}')"`:''}>${u.avatar?.startsWith('/')?'':escapeHtml(u.avatar || '👤')}</div>
          <div><div style="font-weight:600">${escapeHtml(u.display_name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(u.username)}</div></div>
        </div>
      `).join('');
      $('searchResults').querySelectorAll('.user-result').forEach(el => {
        el.onclick = async () => {
          const r = await api('/api/chats/direct', { method: 'POST', body: { user_id: +el.dataset.id } });
          closeModal(); await loadChats(); openChat(r.chat_id);
        };
      });
    });
  });
}

function modalCreateGroup(type) {
  const title = type === 'channel' ? '📢 Новый канал' : '👥 Новая группа';
  openModal(`
    <h2>${title}</h2>
    <div class="field"><label>Название</label><input id="grpTitle" required /></div>
    <div class="field"><label>Описание</label><textarea id="grpDesc"></textarea></div>
    <div class="field"><label>Эмодзи-аватар</label><input id="grpAvatar" value="${type === 'channel' ? '📢' : '👥'}" maxlength="2" /></div>
    <div class="field"><label>Найти участников</label><input id="userSearch" placeholder="Поиск..." /></div>
    <div class="user-search-results" id="searchResults"></div>
    <div style="margin-top:8px;font-size:13px;color:var(--text-muted)">Выбрано: <span id="selCount">0</span></div>
    <div class="modal-actions">
      <button class="btn" data-close>Отмена</button>
      <button class="btn btn-primary" id="createBtn">Создать</button>
    </div>
  `, () => {
    const selected = new Set();
    $('userSearch').addEventListener('input', async (e) => {
      const q = e.target.value.trim();
      if (!q) { $('searchResults').innerHTML = ''; return; }
      const d = await api('/api/users/search?q=' + encodeURIComponent(q));
      $('searchResults').innerHTML = d.users.map(u => `
        <div class="user-result ${selected.has(u.id)?'selected':''}" data-id="${u.id}">
          <div class="avatar small" ${u.avatar?.startsWith('/')?`style="background-image:url('${u.avatar}')"`:''}>${u.avatar?.startsWith('/')?'':escapeHtml(u.avatar || '👤')}</div>
          <div><div style="font-weight:600">${escapeHtml(u.display_name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(u.username)}</div></div>
          <span class="check">${selected.has(u.id) ? '✓' : ''}</span>
        </div>
      `).join('');
      $('searchResults').querySelectorAll('.user-result').forEach(el => {
        el.onclick = () => {
          const id = +el.dataset.id;
          if (selected.has(id)) selected.delete(id); else selected.add(id);
          $('selCount').textContent = selected.size;
          el.classList.toggle('selected');
          el.querySelector('.check').textContent = selected.has(id) ? '✓' : '';
        };
      });
    });
    $('createBtn').onclick = async () => {
      const t = $('grpTitle').value.trim();
      if (!t) return toast('Введите название', 'error');
      const r = await api('/api/chats/group', { method: 'POST', body: {
        title: t, type,
        description: $('grpDesc').value,
        avatar: $('grpAvatar').value || (type === 'channel' ? '📢' : '👥'),
        member_ids: [...selected]
      }});
      closeModal(); await loadChats(); openChat(r.chat_id);
    };
  });
}

// ============ CHAT CONTEXT MENU ============
function chatContextMenu(e, chat) {
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.top = e.clientY + 'px';
  menu.style.left = e.clientX + 'px';
  menu.innerHTML = `
    <button data-act="pin"><span class="ctx-icon">📌</span> ${chat.pinned ? 'Открепить' : 'Закрепить'}</button>
    <button data-act="mute"><span class="ctx-icon">${chat.muted ? '🔔' : '🔕'}</span> ${chat.muted ? 'Включить уведомления' : 'Заглушить'}</button>
    <button data-act="info"><span class="ctx-icon">ℹ️</span> Информация</button>
  `;
  document.body.appendChild(menu);
  menu.onclick = async (ev) => {
    const act = ev.target.closest('button')?.dataset.act;
    if (act === 'pin') {
      await api(`/api/chats/${chat.id}/membership`, { method: 'PATCH', body: { pinned: !chat.pinned } });
      chat.pinned = chat.pinned ? 0 : 1; renderChatList();
    } else if (act === 'mute') {
      await api(`/api/chats/${chat.id}/membership`, { method: 'PATCH', body: { muted: !chat.muted } });
      chat.muted = chat.muted ? 0 : 1; renderChatList();
    } else if (act === 'info') showChatInfo(chat);
    menu.remove();
  };
  setTimeout(() => {
    const off = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', off); } };
    document.addEventListener('click', off);
  }, 50);
}

function showChatInfo(chat) {
  openModal(`
    <div style="text-align:center;margin-bottom:16px">
      <div class="avatar huge" id="ciAvatar" style="margin:0 auto 12px"></div>
      <h2 style="margin-bottom:4px">${escapeHtml(chat.title || '—')}</h2>
      <div style="color:var(--text-muted)">${chat.type === 'direct' ? 'личный чат' :
        chat.type === 'group' ? 'группа' : chat.type === 'channel' ? 'канал' :
        chat.type === 'ai' ? '🤖 AI-ассистент' : chat.type === 'favorites' ? '⭐ ваши заметки' : ''}</div>
      ${chat.description ? `<div style="margin-top:12px;color:var(--text-secondary)">${escapeHtml(chat.description)}</div>` : ''}
    </div>
    <div class="switch-row">
      <div><div class="switch-row-label">📌 Закреплено</div></div>
      <div class="switch ${chat.pinned?'on':''}" data-act="pin"></div>
    </div>
    <div class="switch-row">
      <div><div class="switch-row-label">🔕 Без звука</div></div>
      <div class="switch ${chat.muted?'on':''}" data-act="mute"></div>
    </div>
    <div class="modal-actions"><button class="btn" data-close>Закрыть</button></div>
  `, () => {
    renderAvatarInto($('ciAvatar'), chat.type === 'direct' ? chat.peer : { avatar: chatIcon(chat) }, 'huge');
    $('modalContent').querySelectorAll('.switch').forEach(sw => {
      sw.onclick = async () => {
        const act = sw.dataset.act;
        const val = !sw.classList.contains('on');
        await api(`/api/chats/${chat.id}/membership`, { method: 'PATCH', body: { [act === 'pin' ? 'pinned' : 'muted']: val } });
        chat[act === 'pin' ? 'pinned' : 'muted'] = val ? 1 : 0;
        sw.classList.toggle('on');
        renderChatList();
      };
    });
  });
}

// ============ PROFILE ============
$('profileBtn').onclick = $('me').onclick = () => openProfile();

function openProfile() {
  const u = state.user;
  openModal(`
    <h2 style="text-align:center">Профиль</h2>
    <div class="avatar-upload-wrap" id="avaWrap">
      <div class="avatar" id="pfAvaPreview"></div>
      <div class="overlay">📷</div>
    </div>
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-weight:600;font-size:18px">${escapeHtml(u.display_name)}</div>
      <div style="color:var(--text-muted);font-size:13px">@${escapeHtml(u.username)}</div>
    </div>
    <div class="field"><label>Отображаемое имя</label><input id="pfName" value="${escapeHtml(u.display_name)}" /></div>
    <div class="field"><label>О себе</label><textarea id="pfBio">${escapeHtml(u.bio || '')}</textarea></div>
    <div class="field"><label>Эмодзи-аватар (или загрузите картинку выше)</label>
      <input id="pfAvatarEmoji" placeholder="Например: 🦊" maxlength="2" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger" id="logoutBtn">Выйти</button>
      <button class="btn" data-close>Отмена</button>
      <button class="btn btn-primary" id="saveBtn">Сохранить</button>
    </div>
  `, () => {
    renderAvatarInto($('pfAvaPreview'), u, '');
    $('avaWrap').onclick = () => $('avatarFileInput').click();
    $('saveBtn').onclick = async () => {
      const patch = { display_name: $('pfName').value, bio: $('pfBio').value };
      const emoji = $('pfAvatarEmoji').value.trim();
      if (emoji) patch.avatar = emoji;
      const d = await api('/api/me', { method: 'PATCH', body: patch });
      state.user = d.user; renderMe(); closeModal(); toast('✓ Сохранено', 'success');
    };
    $('logoutBtn').onclick = () => { localStorage.removeItem('orbit_token'); location.reload(); };
  });
}

$('avatarFileInput').onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  toast('Загрузка аватара…');
  try {
    const d = await api('/api/me/avatar', { method: 'POST', body: fd });
    state.user = d.user; renderMe();
    if ($('pfAvaPreview')) renderAvatarInto($('pfAvaPreview'), d.user, '');
    toast('✓ Аватар обновлён', 'success');
  } catch { toast('Ошибка загрузки', 'error'); }
  e.target.value = '';
};

// ============ SETTINGS ============
$('settingsBtn').onclick = () => openSettings('appearance');

function openSettings(tab = 'appearance') {
  openModal(`
    <h2>⚙️ Настройки</h2>
    <div class="settings-nav">
      <button data-tab="appearance">🎨 Внешний вид</button>
      <button data-tab="wallpaper">🖼 Обои</button>
      <button data-tab="behavior">⚡ Поведение</button>
      <button data-tab="about">ℹ️ О Orbit</button>
    </div>
    <div id="settingsBody"></div>
    <div class="modal-actions">
      <button class="btn" id="resetBtn">Сбросить</button>
      <button class="btn btn-primary" data-close>Готово</button>
    </div>
  `, () => {
    const renderTab = (t) => {
      document.querySelectorAll('.settings-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
      $('settingsBody').innerHTML = settingsTabContent(t);
      bindSettingsTab(t);
    };
    document.querySelectorAll('.settings-nav button').forEach(b => b.onclick = () => renderTab(b.dataset.tab));
    $('resetBtn').onclick = () => {
      if (confirm('Сбросить все настройки?')) {
        Object.assign(settings, DEFAULT_SETTINGS);
        saveSettings(); renderTab(tab);
      }
    };
    renderTab(tab);
  }, 'wide');
}

function settingsTabContent(tab) {
  if (tab === 'appearance') {
    return `
      <h3>Тема</h3>
      <div class="theme-grid">
        ${THEMES.map(t => `
          <div class="theme-card ${settings.theme === t.id ? 'active' : ''}" data-theme="${t.id}">
            <div class="theme-preview" style="background:${t.bg}">
              <div class="bubble-mini" style="background:${t.bubble};width:60%"></div>
              <div class="bubble-mini" style="background:${t.out};width:50%;margin-left:auto"></div>
              <div class="bubble-mini" style="background:${t.bubble};width:70%"></div>
            </div>
            <div class="theme-name">${t.name}</div>
          </div>
        `).join('')}
      </div>

      <h3>Акцентный цвет</h3>
      <div class="color-grid">
        ${ACCENTS.map(a => `
          <div class="color-card ${settings.accent === a.c ? 'active' : ''}"
               data-c="${a.c}" data-c2="${a.c2}"
               style="background:linear-gradient(135deg,${a.c},${a.c2})" title="${a.name}">
            ${settings.accent === a.c ? '✓' : ''}
          </div>
        `).join('')}
      </div>
      <div class="field" style="margin-top:12px">
        <label>Свой цвет</label>
        <input type="color" id="customAccent" value="${settings.accent}" style="width:60px;height:42px;padding:4px;cursor:pointer" />
      </div>

      <h3>Размер текста</h3>
      <div class="fs-options">
        <button data-fs="small" class="${settings.fontSize === 'small' ? 'active' : ''}">Маленький</button>
        <button data-fs="normal" class="${settings.fontSize === 'normal' ? 'active' : ''}">Обычный</button>
        <button data-fs="large" class="${settings.fontSize === 'large' ? 'active' : ''}">Крупный</button>
        <button data-fs="xlarge" class="${settings.fontSize === 'xlarge' ? 'active' : ''}">Огромный</button>
      </div>

      <h3>Аватары</h3>
      <div class="switch-row">
        <div><div class="switch-row-label">Показывать аватары в чате</div>
        <div class="switch-row-desc">Около каждого сообщения</div></div>
        <div class="switch ${settings.showAvatars ? 'on' : ''}" data-toggle="showAvatars"></div>
      </div>
    `;
  }
  if (tab === 'wallpaper') {
    return `
      <h3>Готовые обои</h3>
      <div class="wallpaper-grid">
        ${WALLPAPERS.map(w => `
          <div class="wallpaper-card ${settings.wallpaper === w.id && !settings.customWallpaper ? 'active' : ''}"
               data-wp="${w.id}" style="background:${w.preview}">
          </div>
        `).join('')}
      </div>
      <h3>Загрузить свои обои</h3>
      <button class="btn" id="uploadWpBtn" style="width:100%">📷 Выбрать картинку</button>
      ${settings.customWallpaper ? `
        <div style="margin-top:12px;text-align:center">
          <div style="width:120px;height:120px;border-radius:12px;margin:0 auto 8px;
                      background:url('${settings.customWallpaper}') center/cover"></div>
          <button class="btn btn-danger" id="clearWpBtn">Удалить свои обои</button>
        </div>
      ` : ''}
    `;
  }
  if (tab === 'behavior') {
    return `
      <h3>Отправка</h3>
      <div class="switch-row">
        <div><div class="switch-row-label">Enter — отправить</div>
        <div class="switch-row-desc">Иначе — перенос строки; для отправки кнопка ➤</div></div>
        <div class="switch ${settings.sendOnEnter ? 'on' : ''}" data-toggle="sendOnEnter"></div>
      </div>
      <h3>Звуки</h3>
      <div class="switch-row">
        <div><div class="switch-row-label">🔔 Звук уведомлений</div>
        <div class="switch-row-desc">Сигнал при новом сообщении</div></div>
        <div class="switch ${settings.sounds ? 'on' : ''}" data-toggle="sounds"></div>
      </div>
    `;
  }
  if (tab === 'about') {
    return `
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:72px;margin-bottom:12px">🛰</div>
        <h2 style="margin-bottom:6px">Orbit</h2>
        <div style="color:var(--text-muted);margin-bottom:20px">Версия 2.0 · современный мессенджер</div>
        <div style="text-align:left;background:var(--bg);padding:16px;border-radius:12px">
          <div style="font-weight:600;margin-bottom:8px">✨ Возможности:</div>
          <ul style="padding-left:20px;line-height:1.8;color:var(--text-secondary)">
            <li>🤖 Встроенный AI-ассистент</li>
            <li>💬 Чаты, группы, каналы</li>
            <li>⭐ Избранное (сохранённые сообщения)</li>
            <li>🎨 6 тем + кастомный акцент</li>
            <li>🖼 Обои чата (готовые + свои)</li>
            <li>📎 Файлы и картинки до 25 МБ</li>
            <li>⚡ Real-time через WebSocket</li>
            <li>😊 Реакции на сообщения</li>
            <li>↩️ Ответы, редактирование, удаление</li>
          </ul>
        </div>
      </div>
    `;
  }
}

function bindSettingsTab(tab) {
  if (tab === 'appearance') {
    document.querySelectorAll('.theme-card').forEach(c => c.onclick = () => {
      settings.theme = c.dataset.theme; saveSettings();
      document.querySelectorAll('.theme-card').forEach(x => x.classList.toggle('active', x === c));
    });
    document.querySelectorAll('.color-card').forEach(c => c.onclick = () => {
      settings.accent = c.dataset.c; settings.accent2 = c.dataset.c2; saveSettings();
      document.querySelectorAll('.color-card').forEach(x => { x.classList.remove('active'); x.innerHTML = ''; });
      c.classList.add('active'); c.innerHTML = '✓';
    });
    $('customAccent').oninput = (e) => {
      settings.accent = e.target.value;
      settings.accent2 = lightenColor(e.target.value, 30);
      saveSettings();
    };
    document.querySelectorAll('.fs-options button').forEach(b => b.onclick = () => {
      settings.fontSize = b.dataset.fs; saveSettings();
      document.querySelectorAll('.fs-options button').forEach(x => x.classList.toggle('active', x === b));
    });
    document.querySelectorAll('.switch[data-toggle]').forEach(sw => sw.onclick = () => {
      const key = sw.dataset.toggle;
      settings[key] = !settings[key]; saveSettings();
      sw.classList.toggle('on');
      if (key === 'showAvatars' && state.activeChatId) renderMessages();
    });
  }
  if (tab === 'wallpaper') {
    document.querySelectorAll('.wallpaper-card').forEach(c => c.onclick = () => {
      settings.wallpaper = c.dataset.wp;
      settings.customWallpaper = null;
      saveSettings();
      document.querySelectorAll('.wallpaper-card').forEach(x => x.classList.toggle('active', x === c));
    });
    $('uploadWpBtn').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast('Картинка > 5 МБ', 'error'); return; }
        const reader = new FileReader();
        reader.onload = () => {
          settings.customWallpaper = reader.result;
          saveSettings();
          openSettings('wallpaper');
          toast('✓ Обои установлены', 'success');
        };
        reader.readAsDataURL(f);
      };
      inp.click();
    };
    const clearBtn = $('clearWpBtn');
    if (clearBtn) clearBtn.onclick = () => { settings.customWallpaper = null; saveSettings(); openSettings('wallpaper'); };
  }
  if (tab === 'behavior') {
    document.querySelectorAll('.switch[data-toggle]').forEach(sw => sw.onclick = () => {
      const key = sw.dataset.toggle;
      settings[key] = !settings[key]; saveSettings();
      sw.classList.toggle('on');
    });
  }
}

function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * percent / 100));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * percent / 100));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * percent / 100));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ============ SEARCH IN SIDEBAR ============
$('searchInput').addEventListener('input', (e) => renderChatList(e.target.value));

// ============ BACK ============
$('backBtn').onclick = () => { $('app').classList.remove('chat-open'); state.activeChatId = null; };

// ============ MODAL ============
function openModal(html, after, klass = '') {
  $('modalContent').innerHTML = html;
  $('modalContent').className = 'modal-content ' + klass;
  $('modal').classList.remove('hidden');
  if (after) after();
}
function closeModal() { $('modal').classList.add('hidden'); }
$('modal').addEventListener('click', (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); document.querySelectorAll('.ctx-menu, .image-viewer').forEach(x => x.remove()); }});

// ============ IMAGE VIEWER ============
function openImageViewer(url) {
  const v = document.createElement('div');
  v.className = 'image-viewer';
  v.innerHTML = `<button class="icon-btn close">✕</button><img src="${url}" />`;
  v.onclick = (e) => { if (e.target.tagName !== 'IMG' || e.target.closest('.close')) v.remove(); };
  document.body.appendChild(v);
}

// ============ TOAST ============
function toast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ============ UTILS ============
function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatContent(s) {
  let h = escapeHtml(s);
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/(^|\s)_(.+?)_($|\s)/g, '$1<i>$2</i>$3');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  return h;
}
function formatTime(ts) { const d = new Date(ts); return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0'); }
function formatDate(ts) {
  const d = new Date(ts), t = new Date(), y = new Date(); y.setDate(y.getDate()-1);
  if (d.toDateString() === t.toDateString()) return 'Сегодня';
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}
function formatSize(b) {
  if (b < 1024) return b + ' Б';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' КБ';
  return (b/1024/1024).toFixed(1) + ' МБ';
}
function scrollToBottom() { const m = $('messages'); requestAnimationFrame(() => { m.scrollTop = m.scrollHeight; }); }
function playPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 660; g.gain.value = 0.04;
    o.start(); o.stop(ctx.currentTime + 0.12);
  } catch {}
}
