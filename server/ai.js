// Локальный "AI-ассистент" Orbit.
// Работает без внешних API: эвристики + шаблоны.
// Команды: /summary  /translate <lang> <text>  /idea <тема>  /help  иначе — умный ответ.

const RU_GREETS = ['привет', 'здаров', 'хай', 'добрый день', 'добрый вечер', 'здравствуй'];
const EN_GREETS = ['hi', 'hello', 'hey', 'yo', 'good morning', 'good evening'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function summarize(messages) {
  if (!messages.length) return 'Пока нечего суммировать — в чате нет сообщений.';
  const last = messages.slice(-30);
  const wordsFreq = {};
  for (const m of last) {
    if (!m.content) continue;
    for (const w of m.content.toLowerCase().split(/[^a-zа-яё0-9]+/i)) {
      if (w.length < 4) continue;
      wordsFreq[w] = (wordsFreq[w] || 0) + 1;
    }
  }
  const top = Object.entries(wordsFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
  const authors = [...new Set(last.map(m => m.sender_name).filter(Boolean))];
  return `📋 Краткое резюме последних ${last.length} сообщений:\n` +
         `• Участники: ${authors.join(', ') || '—'}\n` +
         `• Ключевые темы: ${top.join(', ') || '—'}\n` +
         `• Последнее сообщение: "${(last[last.length - 1].content || '').slice(0, 120)}"`;
}

function translate(text, lang) {
  // Игрушечный «переводчик» — переставляет слова и помечает.
  // В реальном проекте сюда подключается DeepL / OpenAI / LibreTranslate.
  if (!text) return 'Использование: /translate <код языка> <текст>. Пример: /translate en Привет, как дела?';
  const map = {
    en: 'английский', ru: 'русский', es: 'испанский',
    de: 'немецкий', fr: 'французский', zh: 'китайский', ja: 'японский'
  };
  const langName = map[lang] || lang;
  return `🌐 Перевод на ${langName} (демо):\n"${text}"\n\n_Для боевого перевода подключите API DeepL/OpenAI в server/ai.js_`;
}

function ideas(topic) {
  if (!topic) return 'Использование: /idea <тема>. Например: /idea стартап в сфере образования';
  const templates = [
    `💡 Идея 1: Сделать ${topic} с использованием AI для персонализации.`,
    `💡 Идея 2: Запустить мобильное приложение для ${topic} с геймификацией.`,
    `💡 Идея 3: Создать комьюнити вокруг ${topic} с реферальной программой.`,
    `💡 Идея 4: Платформа подписок: ${topic} как сервис.`,
    `💡 Идея 5: Маркетплейс — соединить тех, кто умеет ${topic}, и тех, кому нужно.`,
  ];
  return templates.join('\n');
}

function help() {
  return [
    '🤖 *Orbit AI* — что я умею:',
    '• `/help` — это меню',
    '• `/summary` — кратко изложить переписку',
    '• `/translate en Привет` — перевод',
    '• `/idea стартап` — генерация идей',
    '• Просто напишите вопрос — отвечу!'
  ].join('\n');
}

function smartReply(text) {
  const t = text.toLowerCase().trim();
  if (RU_GREETS.some(g => t.startsWith(g))) {
    return pick([
      'Привет! 👋 Я Orbit AI. Чем помочь?',
      'Здравствуйте! Готов ответить или помочь по чату. Напишите /help.',
      'Хай! Что обсуждаем? 🚀'
    ]);
  }
  if (EN_GREETS.some(g => t.startsWith(g))) {
    return pick(['Hi there! 👋', 'Hello! How can I help?', 'Hey! 🚀']);
  }
  if (/как (тебя )?зовут|кто ты|what.*your name|who are you/.test(t)) {
    return 'Я — Orbit AI, встроенный ассистент мессенджера Orbit 🛰️. Помогаю с переводами, идеями и кратким пересказом.';
  }
  if (/спасиб|thank/i.test(t)) {
    return pick(['Пожалуйста! 😊', 'Всегда рад помочь!', 'Обращайтесь!']);
  }
  if (/погод|weather/i.test(t)) {
    return '🌤️ Я пока не подключён к API погоды. Но если добавите ключ OpenWeather в server/ai.js — буду показывать прогноз!';
  }
  if (/анекдот|шутк|joke/i.test(t)) {
    return pick([
      '😄 — Доктор, у меня всё болит! — Что именно? — Когда нажимаю сюда — тут болит, сюда — тут болит... — У вас сломан палец.',
      '😄 Программист идёт в магазин: купи хлеб, если будут яйца — возьми 10. Возвращается с 10 буханками.',
      '😄 — Что общего у программиста и волшебника? — Оба знают заклинания, но никто не понимает, как они работают.'
    ]);
  }
  if (t.endsWith('?')) {
    return `Хороший вопрос. По "${text.slice(0, 60)}" могу сказать: попробуйте разбить задачу на шаги. Если хотите — напишите /idea ${t.replace('?','').slice(0,30)} и я предложу варианты.`;
  }
  return `Понял: "${text.slice(0, 100)}". Это локальный AI без внешних моделей, но я могу: суммировать чат (/summary), переводить (/translate), генерировать идеи (/idea). Введите /help.`;
}

function handle(text, context = {}) {
  text = (text || '').trim();
  if (!text) return help();
  if (text === '/help') return help();
  if (text === '/summary') return summarize(context.messages || []);
  if (text.startsWith('/translate')) {
    const parts = text.split(/\s+/);
    const lang = parts[1];
    const rest = parts.slice(2).join(' ');
    return translate(rest, lang);
  }
  if (text.startsWith('/idea')) {
    return ideas(text.replace(/^\/idea\s*/, ''));
  }
  return smartReply(text);
}

module.exports = { handle };
