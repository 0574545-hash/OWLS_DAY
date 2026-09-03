/* Трекер дня — OWLS.  Автономное веб-приложение, без сборки и без зависимостей. */
'use strict';

/* Если что-то падает на старте — показываем ошибку и кнопку сброса, а не пустой экран. */
function fatal(msg) {
  const el = document.getElementById('fatal');
  if (!el) return;
  el.hidden = false;
  el.querySelector('.f-msg').textContent = String(msg);
}
addEventListener('error', e => fatal(e.message + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')));
addEventListener('unhandledrejection', e => fatal(e.reason && e.reason.message || e.reason));
async function hardReset() {
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  } catch (e) { /* нет SW — и ладно */ }
  location.reload();
}
document.addEventListener('click', e => { if (e.target.closest('[data-act="hard-reset"]')) hardReset(); });

/* ============================ утилиты ============================ */

const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const MOODS = ['Тяжело','Никак','Ровно','Хорошо','Ясно'];
/* Дни недели в порядке пн…вс; значение — номер, который возвращает Date.getDay(). */
const DOW = [{ n:1, s:'пн' },{ n:2, s:'вт' },{ n:3, s:'ср' },{ n:4, s:'чт' },{ n:5, s:'пт' },{ n:6, s:'сб' },{ n:0, s:'вс' }];
const EVERYDAY = [0,1,2,3,4,5,6];
const WEEKDAY_SET = [1,2,3,4,5];
const WEEKEND_SET = [0,6];

const PHASES = [
  { key:'morning', name:'Утро'  },
  { key:'day',     name:'День'  },
  { key:'evening', name:'Вечер' },
];
const TITLES = {
  check: { eyebrow:'Чек-лист',    title:'День по частям' },
  stop:  { eyebrow:'Стоп-лист',   title:'Не сегодня'     },
  meds:  { eyebrow:'Лекарства',   title:'Приём'          },
  wish:  { eyebrow:'Wish list',   title:'Желания'        },
  diary: { eyebrow:'Дневник дня', title:'Итог дня'       },
};
const TABS = [
  { key:'check', icon:'check', label:'Чек-лист'  },
  { key:'stop',  icon:'stop',  label:'Стоп-лист' },
  { key:'diary', icon:'diary', label:'Дневник'   },
  { key:'wish',  icon:'wish',  label:'Wish list' },
  { key:'meds',  icon:'pill',  label:'Лекарства' },
];

const MED_FORMS = {
  tab:     { label:'Таблетка', one:'таблетка', few:'таблетки', many:'таблеток' },
  drops:   { label:'Капли',    one:'капля',    few:'капли',    many:'капель'   },
  portion: { label:'Порция',   one:'порция',   few:'порции',   many:'порций'   },
};
const MED_MEAL = { before:'до еды', with:'во время еды', after:'после еды' };
const MED_EVERY = { 1:'Ежедневно', 2:'Через день', 3:'Раз в 3 дня', 7:'Раз в неделю' };
/** Приём сегодня? Отсчёт от дня добавления: каждые N дней. */
function medToday(m) {
  const every = Number(m.every) || 1;
  if (every === 1) return true;
  const diff = Math.round((parseKey(dayKeyOf(new Date())) - parseKey(m.start || dayKeyOf(new Date()))) / 86400000);
  return diff >= 0 && diff % every === 0;
}
/** Через сколько дней следующий приём (0 — сегодня). */
function medNextIn(m) {
  const every = Number(m.every) || 1;
  const diff = Math.round((parseKey(dayKeyOf(new Date())) - parseKey(m.start || dayKeyOf(new Date()))) / 86400000);
  return diff < 0 ? -diff : (every - (diff % every)) % every;
}
/** «2 таблетки · после еды» */
function medLine(m) {
  const f = MED_FORMS[m.form] || MED_FORMS.tab;
  return m.qty + ' ' + plural(m.qty, f.one, f.few, f.many) + ' · ' + (MED_MEAL[m.meal] || MED_MEAL.after);
}
/** …и частота, если не ежедневно: «2 таблетки · после еды · через день» */
function medLineFull(m) {
  const e = Number(m.every) || 1;
  return medLine(m) + (e > 1 ? ' · ' + MED_EVERY[e].toLowerCase() : '');
}

/** Русское склонение: 1 день, 2 дня, 5 дней. */
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

const pad2 = n => String(n).padStart(2, '0');
/** Локальный ключ дня — не UTC, иначе день переключается не в полночь. */
const dayKeyOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const fmtDate = iso => { const d = parseKey(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()]; };
const daysLeft = iso => Math.round((parseKey(iso) - parseKey(dayKeyOf(new Date()))) / 86400000);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Блок дня выводится из времени: до 12:00 — утро, до 18:00 — день, дальше вечер. */
function phaseOfTime(time) {
  if (!time) return 'day';
  const h = Number(String(time).slice(0, 2));
  if (Number.isNaN(h)) return 'day';
  if (h < 12) return 'morning';
  if (h < 18) return 'day';
  return 'evening';
}

/** Человеческое описание периодичности. */
function repeatLabel(days) {
  const d = [...(days || EVERYDAY)].sort((a, b) => a - b);
  const same = arr => arr.length === d.length && arr.every(x => d.includes(x));
  if (same(EVERYDAY)) return 'Каждый день';
  if (same(WEEKDAY_SET)) return 'Будни';
  if (same(WEEKEND_SET)) return 'Выходные';
  if (d.length === 0) return 'Никогда';
  return DOW.filter(x => d.includes(x.n)).map(x => x.s).join(', ');
}

/** Показывать ли пункт сегодня. */
const onToday = i => (i.days || EVERYDAY).includes(new Date().getDay());

/* ============================ иконки ============================ */

const ICON = {
  morning:'<path d="M12 5V3M5.5 8.5 4 7M18.5 8.5 20 7M3 17h18M6 17a6 6 0 0 1 12 0"/>',
  day:'<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
  evening:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  check:'<path d="M9 5h11M9 12h11M9 19h11"/><path d="M3 5.5 4.4 7 6.8 4"/><path d="M3 12.5 4.4 14 6.8 11"/><path d="M3 19.5 4.4 21 6.8 18"/>',
  stop:'<circle cx="12" cy="12" r="8.5"/><path d="M6 18 18 6"/>',
  set:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>',
  wish:'<path d="m12 3.5 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.9l6.1-.8Z"/>',
  diary:'<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  tick:'<path d="M4 12.5 9.5 18 20 6.5"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>',
  trash:'<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  pill:'<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9.2 9.2 5.6 5.6"/>',
  photo:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.8"/><path d="m4.5 17 4.8-4.2 3.4 3 2.6-2.2 4.2 3.4"/>',
};
function svg(name, o = {}) {
  const s = o.size || 20, c = o.color || 'currentColor', w = o.width || 1.6;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="' + c +
    '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
}
const trashBtn = (act, attrs, label) =>
  '<button class="del" data-act="' + act + '" ' + attrs + ' aria-label="' + label + '">' +
  svg('trash', { size:15, color:'#B43232', width:1.5 }) + '</button>';

/* ============================ состояние ============================ */

const KEY = 'owls.day-tracker.v1';   // ключ хранения не меняем, чтобы данные пережили обновление

function seed() {
  const day = t => ({ days:[...EVERYDAY], time:t });
  return {
    v: 2,
    tab: 'check',
    dayKey: dayKeyOf(new Date()),
    items: {
      morning: [
        { id:'m1', text:'Стакан воды',             done:false, ...day('07:00') },
        { id:'m2', text:'Зарядка 15 минут',        done:false, ...day('07:20') },
        { id:'m3', text:'Прочитать установку дня', done:false, ...day('07:40') },
        { id:'m4', text:'Завтрак без телефона',    done:false, ...day('08:10') },
      ],
      day: [
        { id:'d1', text:'Три главные задачи',   done:false, days:[...WEEKDAY_SET], time:'10:00' },
        { id:'d2', text:'Прогулка 30 минут',    done:false, ...day('13:00') },
        { id:'d3', text:'Без сахара до вечера', done:false, ...day('') },
        { id:'d4', text:'Разобрать входящие',   done:false, days:[...WEEKDAY_SET], time:'17:00' },
      ],
      evening: [
        { id:'e1', text:'Растяжка 10 минут',        done:false, ...day('21:00') },
        { id:'e2', text:'Дневник дня',              done:false, ...day('21:30') },
        { id:'e3', text:'Телефон в другую комнату', done:false, ...day('22:30') },
      ],
    },
    moments: [
      { id:'q1', label:'Стакан воды',        count:0 },
      { id:'q2', label:'Три минуты дыхания', count:0 },
      { id:'q3', label:'Размяться',          count:0 },
      { id:'q4', label:'Отойти от экрана',   count:0 },
      { id:'q5', label:'Записать мысль',     count:0 },
    ],
    intentions: [
      { id:'i1', text:'Я делаю меньше, но лучше.'   },
      { id:'i2', text:'Спокойствие — это скорость.' },
      { id:'i3', text:'Тело первое, задачи вторые.' },
      { id:'i4', text:'Я замечаю то, что уже есть.' },
    ],
    wishes: [
      { id:'w1', text:'Полка для книг у окна',         cat:'Дом',         note:'Дуб, 180 см',    due:'', done:false, photo:'' },
      { id:'w2', text:'Пробежать 10 км без остановки', cat:'Тело',        note:'Сейчас 6,5 км',  due:'', done:false, photo:'' },
      { id:'w3', text:'Поехать в Тбилиси на неделю',   cat:'Путешествия', note:'Вдвоём, 7 дней', due:'', done:false, photo:'' },
    ],
    stops: [
      { id:'s1', text:'Телефон в кровати',       clean:0, slipped:false },
      { id:'s2', text:'Сериалы в рабочее время', clean:0, slipped:false },
      { id:'s3', text:'Сладкое после 19:00',     clean:0, slipped:false },
    ],
    meds: [],
    mood: 2,
    fields: { good:'', hard:'', thanks:'' },
    entries: [],
    history: [],
  };
}

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const s = Object.assign(seed(), JSON.parse(raw));
    for (const p of PHASES) if (!Array.isArray(s.items?.[p.key])) { s.items = seed().items; break; }
    if (!Array.isArray(s.history)) s.history = [];
    return migrate(s);
  } catch (e) {
    console.warn('Не удалось прочитать сохранение, начинаем заново.', e);
    return seed();
  }
}

/** Данные первой версии: у пунктов не было периодичности, у желаний — фото. */
function migrate(s) {
  for (const p of PHASES) {
    s.items[p.key] = s.items[p.key].map(i => ({
      ...i,
      time: i.time || '',
      days: Array.isArray(i.days) ? i.days : [...EVERYDAY],
    }));
  }
  s.wishes = (s.wishes || []).map(w => ({ ...w, photo: w.photo || '' }));
  s.intentions = (s.intentions || []).map(i => ({ id: i.id, text: i.text }));
  s.meds = (Array.isArray(s.meds) ? s.meds : []).map(m => ({ ...m, every: Number(m.every) || 1, start: m.start || dayKeyOf(new Date()) }));
  if (!TITLES[s.tab]) s.tab = 'check';   // вкладки «Установки» больше нет
  s.v = 2;
  return s;
}

let saveWarned = false;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    return true;
  } catch (e) {
    if (!saveWarned) { saveWarned = true; toast('Не хватает места в хранилище — удалите часть фото'); }
    return false;
  }
}

/** Смена суток: архивируем вчерашний день, обнуляем дневное, серии растим. */
function rollover() {
  const today = dayKeyOf(new Date());
  if (S.dayKey === today) return;

  const hadDone = PHASES.some(p => S.items[p.key].some(i => i.done)) || S.moments.some(m => m.count > 0);
  if (hadDone && !S.history.includes(S.dayKey)) S.history.push(S.dayKey);
  S.history = S.history.slice(-400);

  for (const p of PHASES) S.items[p.key].forEach(i => { i.done = false; });
  S.moments.forEach(m => { m.count = 0; });
  S.meds.forEach(m => { m.done = false; });
  S.stops.forEach(x => { if (!x.slipped) x.clean += 1; else { x.clean = 0; x.slipped = false; } });
  S.fields = { good:'', hard:'', thanks:'' };
  S.dayKey = today;
  save();
}

/** Серия подряд идущих дней, считая сегодняшний, если он уже начат. */
function streak() {
  const set = new Set(S.history);
  const today = new Date();
  const todayActive = PHASES.some(p => S.items[p.key].some(i => i.done)) || S.moments.some(m => m.count > 0);
  let n = 0;
  let cur = todayActive ? today : addDays(today, -1);
  while (n <= 400) {
    const k = dayKeyOf(cur);
    if (k === dayKeyOf(today)) { if (!todayActive) break; }
    else if (!set.has(k)) break;
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

/* ============================ общий рендер ============================ */

const $screen = document.getElementById('screen');
const $nav = document.getElementById('nav');
const $sheet = document.getElementById('sheet');
const $sheetBody = document.getElementById('sheet-body');
const $seg = document.getElementById('seg');

const headerDate = () => {
  const d = new Date();
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + WEEKDAYS[d.getDay()];
};

function renderNav() {
  $nav.innerHTML = TABS.map(t => {
    const on = S.tab === t.key;
    return '<button data-act="tab" data-tab="' + t.key + '" class="' + (on ? 'on' : '') +
      '" aria-current="' + (on ? 'page' : 'false') + '">' +
      svg(t.icon, { size:21, color: on ? 'var(--accent)' : '#9AA1AB', width:1.8 }) +
      '<span>' + t.label + '</span><i class="ul"></i></button>';
  }).join('');
}

function ringSvg(pct, size, r, w) {
  const c = 2 * Math.PI * r;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="display:block">' +
    '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="#EFECE3" stroke-width="' + w + '"/>' +
    '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="#F26336" stroke-width="' + w +
    '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - pct)).toFixed(1) +
    '" transform="rotate(-90 ' + size/2 + ' ' + size/2 + ')"/></svg>';
}

const emptyHint = text =>
  '<div class="dash">' + text + '<br><span style="color:var(--muted)">Списки настраиваются по нажатию на логотип.</span></div>';

/* ---------- экран: чек-лист ---------- */
function viewCheck() {
  const today = PHASES.map(p => ({ p, list: S.items[p.key].filter(onToday) }));
  const all = today.flatMap(g => g.list);
  const done = all.filter(i => i.done).length, total = all.length;
  const pct = total ? done / total : 0;
  const next = all.find(i => !i.done);
  const st = streak();

  let h = '<div class="card ring-card">' +
    '<div class="ring">' + ringSvg(pct, 78, 31, 8) + '<div class="pct">' + Math.round(pct * 100) + '%</div></div>' +
    '<div class="grow" style="display:flex;flex-direction:column;gap:6px">' +
      '<span class="done-line">' + done + ' из ' + total + ' ' + plural(total, 'пункта', 'пунктов', 'пунктов') + '</span>' +
      '<span class="hint">' + (total === 0 ? 'На сегодня пунктов нет.'
        : next ? 'Дальше: ' + esc(next.text.toLowerCase()) : 'День закрыт полностью. Можно выдохнуть.') + '</span>' +
    '</div></div>';

  if (st > 0) {
    const now = new Date();
    const monday = addDays(now, -((now.getDay() + 6) % 7));
    const hist = new Set(S.history);
    const active = PHASES.some(p => S.items[p.key].some(i => i.done)) || S.moments.some(m => m.count > 0);
    const week = DOW.map((d, i) => {
      const k = dayKeyOf(addDays(monday, i));
      const on = hist.has(k) || (k === dayKeyOf(now) && active);
      return '<div><i class="dot' + (on ? ' on' : '') + '"></i><span>' + d.s + '</span></div>';
    }).join('');
    h += '<div class="streak"><div style="display:flex;flex-direction:column;gap:3px">' +
      '<span class="streak-n">' + st + ' ' + plural(st, 'день', 'дня', 'дней') + ' подряд</span>' +
      '<span class="streak-s">Не пропускайте вечерний блок</span></div>' +
      '<div class="week">' + week + '</div></div>';
  }

  if (S.moments.length) {
    const marks = S.moments.reduce((a, m) => a + m.count, 0);
    h += '<div class="card" style="padding:16px 16px 14px;display:flex;flex-direction:column;gap:12px">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
        '<div class="grow" style="display:flex;flex-direction:column;gap:4px">' +
          '<span class="eyebrow">В моменте</span></div>' +
        '<span style="font-size:11.5px;color:var(--faint);flex:none">' +
          (marks ? 'Сегодня ' + marks + ' ' + plural(marks, 'отметка', 'отметки', 'отметок') : 'Пока без отметок') +
        '</span></div><div class="chips">' +
      S.moments.map(m =>
        '<button class="chip' + (m.count ? ' on' : '') + '" data-act="moment" data-id="' + m.id + '">' +
          (m.count ? '' : svg('plus', { size:13, color:'#9AA1AB', width:2 })) +
          '<span>' + esc(m.label) + '</span>' +
          (m.count ? '<span class="badge">×' + m.count + '</span>' : '') + '</button>').join('') +
      '</div></div>';
  }

  for (const { p, list } of today) {
    if (!list.length) continue;
    const d = list.filter(i => i.done).length;
    const w = Math.round((d / list.length) * 100);
    h += '<section class="card flush">' +
      '<div class="grp-h"><div class="row">' +
        svg(p.key, { size:17, color: p.key === 'morning' ? 'var(--accent)' : 'var(--ink)', width:1.5 }) +
        '<span class="sec-t grow">' + p.name + '</span>' +
        '<span style="font-size:11.5px;color:var(--muted)">' + d + ' / ' + list.length + '</span>' +
      '</div><div class="bar"><i style="width:' + w + '%"></i></div></div>' +
      list.map(i =>
        '<button class="item' + (i.done ? ' is-done' : '') + '" data-act="item" data-phase="' + p.key + '" data-id="' + i.id + '">' +
          '<span class="box' + (i.done ? ' on' : '') + '">' + (i.done ? svg('tick', { size:13, color:'#fff', width:3 }) : '') + '</span>' +
          '<span class="txt">' + esc(i.text) + '</span>' +
          (i.time ? '<span class="time">' + esc(i.time) + '</span>' : '') +
        '</button>').join('') +
      '</section>';
  }

  if (!total && !S.moments.length) h += emptyHint('Чек-лист пуст.');
  return h;
}

/* ---------- экран: стоп-лист ---------- */
function viewStop() {
  if (!S.stops.length) return emptyHint('Стоп-лист пуст.');
  const holding = S.stops.filter(x => !x.slipped).length;
  return '<div class="card pad row" style="gap:16px">' +
      '<span class="stop-ic">' + svg('stop', { size:24, color:'var(--accent)', width:1.5 }) + '</span>' +
      '<div class="grow" style="display:flex;flex-direction:column;gap:4px">' +
        '<span class="big">' + holding + ' из ' + S.stops.length + ' держатся</span>' +
        '<span class="hint">' + (S.stops.some(x => x.slipped)
          ? 'Один срыв не отменяет день. Отмечайте честно.'
          : 'Ни одного срыва сегодня. Так и держите.') + '</span></div></div>' +
    '<section class="card flush">' +
      '<div class="sec-h"><span class="sec-t">Чего не делаю</span>' +
      '<span class="sec-s">Нажмите, если сорвались — серия обнулится</span></div>' +
      S.stops.map(x =>
        '<button class="item" data-act="stop" data-id="' + x.id + '" style="min-height:60px;padding:12px 16px;align-items:flex-start">' +
          '<span class="grow" style="display:flex;flex-direction:column;gap:5px">' +
            '<span style="font-size:14px;font-weight:600;line-height:1.35">' + esc(x.text) + '</span>' +
            '<span style="font-size:11.5px;color:var(--faint)">' +
              (x.slipped ? 'Серия сброшена сегодня' : 'Чисто ' + x.clean + ' ' + plural(x.clean, 'день', 'дня', 'дней')) +
            '</span></span>' +
          '<span class="pill ' + (x.slipped ? 'bad">Сорвался' : 'ok">Держусь') + '</span></button>').join('') +
    '</section>';
}

/* ---------- экран: лекарства ---------- */
function viewMeds() {
  if (!S.meds.length) return emptyHint('Лекарств пока нет.');
  const today = S.meds.filter(medToday);
  if (!today.length) {
    const soon = S.meds.map(m => ({ m, d: medNextIn(m) })).sort((a, b) => a.d - b.d)[0];
    return '<div class="dash">На сегодня приёмов нет.' + (soon ? '<br><span style="color:var(--muted)">Ближайший — ' + esc(soon.m.name) +
      ', через ' + soon.d + ' ' + plural(soon.d, 'день', 'дня', 'дней') + '.</span>' : '') + '</div>';
  }
  const taken = today.filter(m => m.done).length, total = today.length;
  const next = PHASES.flatMap(p => today.filter(m => m.phase === p.key)).find(m => !m.done);
  let h = '<div class="card ring-card">' +
    '<div class="ring">' + ringSvg(total ? taken / total : 0, 78, 31, 8) + '<div class="pct">' + taken + '/' + total + '</div></div>' +
    '<div class="grow" style="display:flex;flex-direction:column;gap:6px">' +
      '<span class="done-line">' + taken + ' из ' + total + ' ' + plural(total, 'приёма', 'приёмов', 'приёмов') + '</span>' +
      '<span class="hint">' + (next ? 'Дальше: ' + esc(next.name) + ', ' + medLine(next) : 'Всё принято. На сегодня закрыто.') + '</span>' +
    '</div></div>';
  for (const p of PHASES) {
    const list = today.filter(m => m.phase === p.key);
    if (!list.length) continue;
    const d = list.filter(m => m.done).length;
    h += '<section class="card flush">' +
      '<div class="grp-h"><div class="row">' +
        svg(p.key, { size:17, color: p.key === 'morning' ? 'var(--accent)' : 'var(--ink)', width:1.5 }) +
        '<span class="sec-t grow">' + p.name + '</span>' +
        '<span style="font-size:11.5px;color:var(--muted)">' + d + ' / ' + list.length + '</span>' +
      '</div><div class="bar"><i style="width:' + Math.round(d / list.length * 100) + '%"></i></div></div>' +
      list.map(m =>
        '<button class="item' + (m.done ? ' is-done' : '') + '" data-act="med" data-id="' + m.id + '" style="min-height:58px">' +
          '<span class="box' + (m.done ? ' on' : '') + '">' + (m.done ? svg('tick', { size:13, color:'#fff', width:3 }) : '') + '</span>' +
          '<span class="grow" style="display:flex;flex-direction:column;gap:3px;text-align:left">' +
            '<span class="txt">' + esc(m.name) + '</span>' +
            '<span style="font-size:11.5px;color:var(--faint)">' + esc(medLine(m)) + '</span></span>' +
        '</button>').join('') +
      '</section>';
  }
  return h;
}

/* ---------- экран: желания ---------- */
function viewWish() {
  if (!S.wishes.length) return emptyHint('Список желаний пуст.');
  const doneN = S.wishes.filter(w => w.done).length;
  const pct = doneN / S.wishes.length;
  const up = S.wishes.filter(w => !w.done && w.due)
    .map(w => ({ w, d: daysLeft(w.due) })).filter(x => x.d >= 0)
    .sort((a, b) => a.d - b.d)[0];
  const nearest = up
    ? 'Ближайшее — ' + up.w.text.toLowerCase() + ', ' + up.d + ' ' + plural(up.d, 'день', 'дня', 'дней')
    : 'Ближайших дат нет';

  let h = '<div class="card pad row" style="justify-content:space-between">' +
    '<div class="grow" style="display:flex;flex-direction:column;gap:3px">' +
      '<span class="big">' + doneN + ' из ' + S.wishes.length + '</span>' +
      '<span class="hint">исполнено из списка желаний</span>' +
      '<span style="font-size:12px;line-height:1.4;color:var(--ink-2)">' + esc(nearest) + '</span></div>' +
    ringSvg(pct, 46, 18, 6) + '</div>';

  h += '<div style="display:flex;flex-direction:column;gap:10px">' + S.wishes.map(w => {
    const left = w.due ? daysLeft(w.due) : null;
    const abs = left === null ? 0 : Math.abs(left);
    let bottom;
    if (w.done) bottom = '<span class="pill ok">Исполнено</span>';
    else if (w.due) bottom = '<span style="display:flex;align-items:baseline;gap:7px">' +
      '<span class="days' + (left < 0 ? ' over' : '') + '">' + abs + '</span>' +
      '<span style="font-size:12px;color:var(--muted)">' +
        plural(abs, 'день', 'дня', 'дней') + (left < 0 ? ' просрочено' : ' осталось') + '</span></span>';
    else bottom = '<span style="font-size:12px;color:var(--faint)">Дата не указана</span>';

    const pic = w.photo
      ? '<img class="wish-photo" src="' + w.photo + '" alt="">'
      : '<span class="mono" aria-hidden="true">' + esc((w.text.trim()[0] || '•').toUpperCase()) + '</span>';

    return '<article class="card flush' + (w.done ? ' is-done' : '') + '">' +
      '<div class="wish-top">' + pic +
        '<div class="grow" style="display:flex;flex-direction:column;gap:8px">' +
          '<span class="wish-t">' + esc(w.text) + '</span>' +
          '<div class="row" style="flex-wrap:wrap;gap:8px">' +
            (w.cat ? '<span class="tag">' + esc(w.cat) + '</span>' : '') +
            (w.note ? '<span style="font-size:12px;color:var(--muted)">' + esc(w.note) + '</span>' : '') +
          '</div></div>' +
        '<button data-act="wish" data-id="' + w.id + '" style="flex:none;padding:4px" aria-label="Отметить исполненным">' +
          '<span class="circ' + (w.done ? ' on' : '') + '">' + (w.done ? svg('tick', { size:13, color:'#fff', width:3 }) : '') +
          '</span></button></div>' +
      '<div class="wish-b">' + bottom +
        '<span class="row" style="gap:7px;flex:none">' + svg('cal', { size:14, color:'#9AA1AB', width:1.5 }) +
          '<span style="font-size:12px;font-weight:600;color:var(--ink-2)">' + (w.due ? fmtDate(w.due) : '—') + '</span>' +
        '</span></div></article>';
  }).join('') + '</div>';
  return h;
}

/* ---------- экран: дневник ---------- */
function viewDiary() {
  return '<div class="card pad" style="display:flex;flex-direction:column;gap:14px">' +
      '<span class="eyebrow">Как прошёл день</span><div class="moods">' +
      MOODS.map((label, i) =>
        '<button class="mood' + (S.mood === i ? ' on' : '') + '" data-act="mood" data-i="' + i + '">' +
        '<i></i><span>' + label + '</span></button>').join('') +
      '</div></div>' +
    '<div class="card pad" style="display:flex;flex-direction:column;gap:16px">' +
      '<div class="fld"><label for="f-good">Что получилось</label>' +
        '<textarea id="f-good" data-draft="good" maxlength="200" rows="2" placeholder="Три строки хватит">' + esc(S.fields.good) + '</textarea></div>' +
      '<div class="fld"><label for="f-hard">Что забрало силы</label>' +
        '<textarea id="f-hard" data-draft="hard" maxlength="200" rows="2" placeholder="Без оценок, просто факт">' + esc(S.fields.hard) + '</textarea></div>' +
      '<div class="fld"><label for="f-thanks">Благодарность</label>' +
        '<textarea id="f-thanks" data-draft="thanks" maxlength="200" rows="2" placeholder="За что сегодня">' + esc(S.fields.thanks) + '</textarea></div>' +
      '<button class="save" data-act="save-entry">Сохранить запись</button></div>' +
    '<section class="card flush">' +
      '<div class="sec-h"><span class="sec-t">Прошлые записи</span></div>' +
      (S.entries.length ? S.entries.map(e =>
        '<div class="entry"><div class="row" style="gap:8px">' +
          '<span class="entry-d">' + esc(e.date) + '</span><span class="tag">' + esc(e.mood) + '</span>' +
          '<span class="grow"></span>' + trashBtn('del-entry', 'data-id="' + e.id + '"', 'Удалить запись') + '</div>' +
          '<span class="entry-t">' + esc(e.text) + '</span></div>').join('')
        : '<div class="empty">Записей пока нет.</div>') + '</section>';
}

const VIEWS = { check:viewCheck, stop:viewStop, meds:viewMeds, wish:viewWish, diary:viewDiary };

function render(keepScroll) {
  const y = keepScroll ? $screen.scrollTop : 0;
  const t = TITLES[S.tab] || TITLES.check;
  document.getElementById('eyebrow').textContent = t.eyebrow;
  document.getElementById('title').textContent = t.title;
  document.getElementById('today').textContent = headerDate();
  $screen.innerHTML = (VIEWS[S.tab] || viewCheck)();
  renderNav();
  $screen.scrollTop = y;
}

/* ============================ настройки ============================ */

const SHEET_TABS = [
  { key:'check', label:'Чек-лист'  },
  { key:'stop',  label:'Стоп-лист' },
  { key:'meds',  label:'Лекарства' },
  { key:'set',   label:'Установки' },
  { key:'wish',  label:'Желания'   },
];

let sheetOpen = false;
let sheetTab = 'check';

/* черновики форм живут вне состояния — их не нужно хранить между запусками */
const F = {
  item: { text:'', time:'', mode:'every', days:[...EVERYDAY] },
  moment: '',
  stop: '',
  set: '',
  wish: { text:'', due:'', photo:'' },
  med: { name:'', form:'tab', qty:'1', phase:'morning', meal:'after', every:'1' },
};

function daysFromMode() {
  if (F.item.mode === 'every') return [...EVERYDAY];
  if (F.item.mode === 'weekdays') return [...WEEKDAY_SET];
  if (F.item.mode === 'weekend') return [...WEEKEND_SET];
  return [...F.item.days];
}

function sheetCheck() {
  const blk = phaseOfTime(F.item.time);
  const blkName = PHASES.find(p => p.key === blk).name;
  let h = '<div class="form">' +
    '<span class="sec-t">Новый пункт</span>' +
    '<div class="f"><label for="i-text">Название</label>' +
      '<input id="i-text" type="text" data-f="item.text" maxlength="200" value="' + esc(F.item.text) + '" placeholder="Например, прогулка 30 минут"></div>' +
    '<div class="f2">' +
      '<div class="f"><label for="i-time">Время</label>' +
        '<input id="i-time" type="time" data-f="item.time" value="' + esc(F.item.time) + '"></div>' +
      '<div class="f"><label for="i-mode">Периодичность</label>' +
        '<select id="i-mode" data-f="item.mode">' +
          '<option value="every"' + (F.item.mode === 'every' ? ' selected' : '') + '>Каждый день</option>' +
          '<option value="weekdays"' + (F.item.mode === 'weekdays' ? ' selected' : '') + '>Будни</option>' +
          '<option value="weekend"' + (F.item.mode === 'weekend' ? ' selected' : '') + '>Выходные</option>' +
          '<option value="custom"' + (F.item.mode === 'custom' ? ' selected' : '') + '>Свои дни</option>' +
        '</select></div></div>' +
    (F.item.mode === 'custom'
      ? '<div class="f"><label>Дни недели</label><div class="days">' +
          DOW.map(d => '<button data-act="dow" data-n="' + d.n + '" class="' + (F.item.days.includes(d.n) ? 'on' : '') + '">' +
            d.s + '</button>').join('') + '</div></div>'
      : '') +
    '<span class="note">Блок выбирается по времени. Этот пункт попадёт в <b>' + blkName + '</b>.</span>' +
    '<button class="btn-add" data-act="add-item">Добавить пункт</button></div>';

  for (const p of PHASES) {
    const list = S.items[p.key];
    if (!list.length) continue;
    h += '<div class="blk">' + p.name + '</div>' + list.map(i =>
      '<div class="mini"><span class="grow">' +
        '<div class="m-t">' + esc(i.text) + '</div>' +
        '<div class="m-s">' + (i.time ? esc(i.time) + ' · ' : '') + repeatLabel(i.days) + '</div></span>' +
        trashBtn('del-item', 'data-phase="' + p.key + '" data-id="' + i.id + '"', 'Удалить пункт') + '</div>').join('');
  }

  h += '<div class="blk">В моменте</div>' +
    '<div class="add"><input type="text" data-f="moment" maxlength="200" value="' + esc(F.moment) +
      '" placeholder="Отметка без времени" enterkeyhint="done">' +
      '<button class="plus" data-act="add-moment" aria-label="Добавить">' + svg('plus', { size:17, color:'#fff', width:2.2 }) +
      '</button></div>' +
    S.moments.map(m => '<div class="mini"><span class="grow m-t">' + esc(m.label) + '</span>' +
      trashBtn('del-moment', 'data-id="' + m.id + '"', 'Удалить отметку') + '</div>').join('');
  return h;
}

function sheetStop() {
  return '<div class="form">' +
      '<span class="sec-t">Новый запрет</span>' +
      '<div class="f"><label for="s-text">Чего не делаю</label>' +
        '<input id="s-text" type="text" data-f="stop" maxlength="200" value="' + esc(F.stop) + '" placeholder="Например, телефон в кровати"></div>' +
      '<button class="btn-add" data-act="add-stop">Добавить запрет</button></div>' +
    (S.stops.length ? S.stops.map(x =>
      '<div class="mini"><span class="grow">' +
        '<div class="m-t">' + esc(x.text) + '</div>' +
        '<div class="m-s">' + (x.slipped ? 'Сорвался сегодня' : 'Чисто ' + x.clean + ' ' + plural(x.clean, 'день', 'дня', 'дней')) + '</div>' +
      '</span>' + trashBtn('del-stop', 'data-id="' + x.id + '"', 'Удалить запрет') + '</div>').join('')
      : '<div class="empty">Пока пусто.</div>');
}

function sheetMeds() {
  const sel = (name, opts, cur) => '<select data-f="med.' + name + '">' +
    Object.entries(opts).map(([v, l]) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  const forms = Object.fromEntries(Object.entries(MED_FORMS).map(([k, v]) => [k, v.label]));
  const phases = Object.fromEntries(PHASES.map(p => [p.key, p.name]));
  const meals = { before:'До еды', with:'Во время еды', after:'После еды' };
  let h = '<div class="form">' +
    '<span class="sec-t">Новое лекарство</span>' +
    '<div class="f"><label for="m-name">Название</label>' +
      '<input id="m-name" type="text" data-f="med.name" maxlength="200" value="' + esc(F.med.name) + '" placeholder="Например, магний"></div>' +
    '<div class="f2">' +
      '<div class="f"><label>Форма</label>' + sel('form', forms, F.med.form) + '</div>' +
      '<div class="f"><label for="m-qty">Количество</label>' +
        '<input id="m-qty" type="number" inputmode="numeric" min="1" max="99" step="1" data-f="med.qty" value="' + esc(F.med.qty) + '"></div></div>' +
    '<div class="f2">' +
      '<div class="f"><label>Когда</label>' + sel('phase', phases, F.med.phase) + '</div>' +
      '<div class="f"><label>Приём</label>' + sel('meal', meals, F.med.meal) + '</div></div>' +
    '<div class="f"><label>Частота</label>' + sel('every', MED_EVERY, String(F.med.every)) + '</div>' +
    (String(F.med.every) !== '1' ? '<span class="note">Отсчёт с сегодняшнего дня: первый приём — сегодня.</span>' : '') +
    '<button class="btn-add" data-act="add-med">Добавить лекарство</button></div>';
  for (const p of PHASES) {
    const list = S.meds.filter(m => m.phase === p.key);
    if (!list.length) continue;
    h += '<div class="blk">' + p.name + '</div>' + list.map(m =>
      '<div class="mini"><span class="grow">' +
        '<div class="m-t">' + esc(m.name) + '</div>' +
        '<div class="m-s">' + esc(medLineFull(m)) + (medToday(m) ? '' : ' · следующий через ' + medNextIn(m) + ' ' + plural(medNextIn(m), 'день', 'дня', 'дней')) + '</div></span>' +
        trashBtn('del-med', 'data-id="' + m.id + '"', 'Удалить лекарство') + '</div>').join('');
  }
  if (!S.meds.length) h += '<div class="empty">Пока пусто.</div>';
  return h;
}

function sheetSet() {
  return '<div class="form">' +
      '<span class="sec-t">Новая установка</span>' +
      '<div class="f"><label for="t-text">Текст</label>' +
        '<input id="t-text" type="text" data-f="set" maxlength="200" value="' + esc(F.set) + '" placeholder="Например, я делаю меньше, но лучше"></div>' +
      '<span class="note">Одна из установок показывается на заставке при запуске.</span>' +
      '<button class="btn-add" data-act="add-intent">Добавить установку</button></div>' +
    (S.intentions.length ? S.intentions.map(i =>
      '<div class="mini"><span class="grow m-t">' + esc(i.text) + '</span>' +
      trashBtn('del-intent', 'data-id="' + i.id + '"', 'Удалить установку') + '</div>').join('')
      : '<div class="empty">Пока пусто.</div>');
}

function sheetWish() {
  const pic = F.wish.photo
    ? '<img class="thumb-lg" src="' + F.wish.photo + '" alt="">'
    : '<span class="thumb-lg ph-empty">Без<br>фото</span>';
  return '<div class="form">' +
      '<span class="sec-t">Новое желание</span>' +
      '<div class="f"><label for="w-text">Название</label>' +
        '<input id="w-text" type="text" data-f="wish.text" maxlength="200" value="' + esc(F.wish.text) + '" placeholder="Например, курс по керамике"></div>' +
      '<div class="f"><label for="w-due">Дата</label>' +
        '<input id="w-due" type="date" data-f="wish.due" value="' + esc(F.wish.due) + '"></div>' +
      '<div class="f"><label>Фото</label><div class="row" style="gap:12px">' + pic +
        '<button class="btn-ghost" data-act="pick-photo" data-target="draft">' +
          svg('photo', { size:16, color:'#6B7280', width:1.5 }) + '<span>' + (F.wish.photo ? 'Заменить' : 'Выбрать фото') + '</span></button>' +
        (F.wish.photo ? '<button class="btn-ghost" data-act="drop-photo">Убрать</button>' : '') +
      '</div></div>' +
      '<button class="btn-add" data-act="add-wish">Добавить желание</button></div>' +
    (S.wishes.length ? S.wishes.map(w => {
      const t = w.photo ? '<img class="thumb" src="' + w.photo + '" alt="">' : '<span class="thumb ph-empty">Нет<br>фото</span>';
      return '<div class="mini">' + t + '<span class="grow">' +
        '<div class="m-t">' + esc(w.text) + '</div>' +
        '<div class="m-s">' + (w.due ? 'до ' + fmtDate(w.due) : 'без даты') + (w.done ? ' · исполнено' : '') + '</div></span>' +
        '<button class="del" data-act="pick-photo" data-target="' + w.id + '" aria-label="Фото желания">' +
          svg('photo', { size:16, color:'#6B7280', width:1.5 }) + '</button>' +
        trashBtn('del-wish', 'data-id="' + w.id + '"', 'Удалить желание') + '</div>';
    }).join('') : '<div class="empty">Пока пусто.</div>');
}

const SHEET_VIEWS = { check:sheetCheck, stop:sheetStop, meds:sheetMeds, set:sheetSet, wish:sheetWish };

function renderSheet() {
  $seg.innerHTML = SHEET_TABS.map(t =>
    '<button data-act="sheet-tab" data-tab="' + t.key + '" class="' + (sheetTab === t.key ? 'on' : '') + '">' +
    t.label + '</button>').join('');
  $sheetBody.innerHTML = (SHEET_VIEWS[sheetTab] || sheetCheck)();
}

function openSheet() {
  sheetOpen = true;
  renderSheet();
  $sheet.classList.add('open');
  $sheet.setAttribute('aria-hidden', 'false');
}
function closeSheet() {
  sheetOpen = false;
  $sheet.classList.remove('open');
  $sheet.setAttribute('aria-hidden', 'true');
  render(false);
}

/* ============================ фото ============================ */

const $photo = document.getElementById('photo-input');
let photoTarget = null;

/** Уменьшаем снимок перед сохранением — иначе хранилище переполнится. */
function shrink(file, max = 420, q = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('не изображение')); };
    img.src = url;
  });
}

$photo.addEventListener('change', async () => {
  const file = $photo.files && $photo.files[0];
  $photo.value = '';
  if (!file || !photoTarget) return;
  try {
    const data = await shrink(file);
    if (photoTarget === 'draft') {
      F.wish.photo = data;
    } else {
      const w = S.wishes.find(x => x.id === photoTarget);
      if (w) { w.photo = data; if (!save()) w.photo = ''; }
    }
    renderSheet();
  } catch (e) {
    toast('Не удалось прочитать изображение');
  } finally {
    photoTarget = null;
  }
});

/* ============================ заставка ============================ */

function splash() {
  const el = document.getElementById('splash');
  if (!S.intentions.length) { el.remove(); return; }
  const pick = S.intentions[Math.floor(Math.random() * S.intentions.length)];
  document.getElementById('splash-text').textContent = pick.text;
  el.hidden = false;
  const hide = () => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 600);
  };
  const t = setTimeout(hide, 2200);
  el.addEventListener('click', () => { clearTimeout(t); hide(); }, { once: true });
  /* если таймеры не сработали (фон, сон телефона) — убираем при первом же возврате */
  setTimeout(() => { if (el.isConnected) el.remove(); }, 4000);
  document.addEventListener('visibilitychange', () => { if (el.isConnected) el.remove(); }, { once: true });
}


/* ============================ радость ============================ */
/* Всплеск частиц — для чек-листа, чипов, стоп-листа и дневника; сова — для желаний. */

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $fx = document.getElementById('fx'), fxc = $fx ? $fx.getContext('2d') : null;
let parts = [], fxRaf = null, dpr = 1;
function fitFx() { if (!$fx) return; dpr = Math.min(2, devicePixelRatio || 1); $fx.width = innerWidth * dpr; $fx.height = innerHeight * dpr; }
fitFx(); addEventListener('resize', fitFx);
const FX_COLORS = ['#F26336','#F26336','#0B1E35','#FFD9CC','#E9E5DC','#F9A98A'];

function burst(x, y, n = 26) {
  if (!fxc) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 2.2 + Math.random() * 4.2;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.4, g:.16, life:1, dec:.016 + Math.random() * .012,
      r: 2 + Math.random() * 3, c: FX_COLORS[i % FX_COLORS.length], rot: Math.random() * 6, vr:(Math.random() - .5) * .3, sq: Math.random() < .5 });
  }
  if (!fxRaf) fxRaf = requestAnimationFrame(fxTick);
}
function fxTick() {
  fxc.clearRect(0, 0, $fx.width, $fx.height);
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= .985; p.life -= p.dec; p.rot += p.vr;
    fxc.save(); fxc.globalAlpha = Math.max(0, p.life); fxc.fillStyle = p.c;
    fxc.translate(p.x * dpr, p.y * dpr); fxc.rotate(p.rot);
    const s = p.r * dpr;
    if (p.sq) fxc.fillRect(-s, -s * .6, s * 2, s * 1.2); else { fxc.beginPath(); fxc.arc(0, 0, s, 0, Math.PI * 2); fxc.fill(); }
    fxc.restore();
  }
  fxRaf = parts.length ? requestAnimationFrame(fxTick) : (fxc.clearRect(0, 0, $fx.width, $fx.height), null);
}

const OWL_WORDS = ['Исполнено.', 'Сбылось.', 'Можно выдохнуть.'];
let owlTimer = null;
function owlSay() {
  const el = document.getElementById('owl');
  if (!el) return;
  document.getElementById('owl-w').textContent = OWL_WORDS[Math.floor(Math.random() * OWL_WORDS.length)];
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  clearTimeout(owlTimer); owlTimer = setTimeout(() => el.classList.remove('go'), 1600);
}

/* вибрация: Android — да; iPhone Safari не даёт веб-страницам доступа к мотору */
function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* не поддерживается */ } }

function animateOnce(el, cls) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/** Всплеск из центра элемента. Вызывать ДО перерисовки — координаты берём с живого узла. */
function splashAt(el) {
  buzz([18, 30, 42]);
  if (reducedMotion || !el) return null;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2);
  return true;
}
/** Сова — для желаний. */
function owlFor(cardSelector) {
  buzz([14, 40, 22]);
  if (reducedMotion) return;
  owlSay();
  const btn = document.querySelector(cardSelector);
  animateOnce(btn && btn.closest('article'), 'nudge');
}

/* ============================ действия ============================ */

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function commit(keepScroll = true) { save(); render(keepScroll); }
function commitSheet() { save(); renderSheet(); }

const ACTIONS = {
  /* навигация */
  tab(el) { S.tab = el.dataset.tab; save(); render(false); },
  settings() { openSheet(); },
  'close-settings'() { closeSheet(); },
  'sheet-tab'(el) { sheetTab = el.dataset.tab; renderSheet(); },

  /* главный экран */
  item(el) {
    const i = S.items[el.dataset.phase].find(x => x.id === el.dataset.id);
    if (!i) return;
    i.done = !i.done;
    if (i.done) splashAt(el.querySelector('.box'));
    commit();
    if (i.done) animateOnce(document.querySelector('[data-act="item"][data-id="' + i.id + '"] .box'), 'pop');
  },
  moment(el) {
    if (holdFired) { holdFired = false; return; }   // клик после удержания — не считаем
    const m = S.moments.find(x => x.id === el.dataset.id);
    if (!m) return;
    m.count += 1;
    splashAt(el);
    commit();
    animateOnce(document.querySelector('[data-act="moment"][data-id="' + m.id + '"]'), 'pop');
  },
  stop(el) {
    const x = S.stops.find(y => y.id === el.dataset.id);
    if (!x) return;
    x.slipped = !x.slipped;
    if (x.slipped) x.clean = 0;
    else splashAt(el.querySelector('.pill'));          // радость — когда снова «Держусь»
    commit();
    if (!x.slipped) animateOnce(document.querySelector('[data-act="stop"][data-id="' + x.id + '"] .pill'), 'pop');
  },
  wish(el) {
    const w = S.wishes.find(x => x.id === el.dataset.id);
    if (!w) return;
    w.done = !w.done;
    w.doneAt = w.done ? dayKeyOf(new Date()) : undefined;
    commit();
    if (w.done) owlFor('[data-act="wish"][data-id="' + w.id + '"]');
  },
  mood(el) { S.mood = Number(el.dataset.i); commit(); },
  'save-entry'() {
    const f = S.fields;
    const text = [f.good, f.hard, f.thanks].map(t => (t || '').trim()).filter(Boolean).join(' · ');
    if (!text) { toast('Заполните хотя бы одно поле'); return; }
    const d = new Date();
    S.entries.unshift({ id: uid('x'), date: d.getDate() + ' ' + MONTHS[d.getMonth()], mood: MOODS[S.mood], text });
    S.fields = { good:'', hard:'', thanks:'' };
    splashAt(document.querySelector('[data-act="save-entry"]'));
    commit(false);
    toast('Запись сохранена');
  },
  'del-entry'(el) { S.entries = S.entries.filter(x => x.id !== el.dataset.id); commit(); },

  /* настройки: чек-лист */
  dow(el) {
    const n = Number(el.dataset.n);
    const has = F.item.days.includes(n);
    F.item.days = has ? F.item.days.filter(x => x !== n) : [...F.item.days, n];
    renderSheet();
  },
  'add-item'() {
    const text = F.item.text.trim();
    if (!text) { toast('Введите название'); return; }
    const days = daysFromMode();
    if (!days.length) { toast('Выберите хотя бы один день'); return; }
    const phase = phaseOfTime(F.item.time);
    S.items[phase].push({ id: uid(phase), text, time: F.item.time, days, done:false });
    S.items[phase].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    F.item = { text:'', time:'', mode:'every', days:[...EVERYDAY] };
    commitSheet();
    toast('Пункт добавлен');
  },
  'del-item'(el) {
    S.items[el.dataset.phase] = S.items[el.dataset.phase].filter(x => x.id !== el.dataset.id);
    commitSheet();
  },
  'add-moment'() {
    const text = F.moment.trim();
    if (!text) return;
    S.moments.push({ id: uid('q'), label: text, count: 0 });
    F.moment = '';
    commitSheet();
  },
  'del-moment'(el) { S.moments = S.moments.filter(x => x.id !== el.dataset.id); commitSheet(); },

  /* лекарства */
  med(el) {
    const m = S.meds.find(x => x.id === el.dataset.id);
    if (!m) return;
    m.done = !m.done;
    if (m.done) splashAt(el.querySelector('.box'));
    commit();
    if (m.done) animateOnce(document.querySelector('[data-act="med"][data-id="' + m.id + '"] .box'), 'pop');
  },
  'add-med'() {
    const name = F.med.name.trim();
    if (!name) { toast('Введите название'); return; }
    const qty = Math.min(99, Math.max(1, Math.round(Number(F.med.qty) || 1)));
    S.meds.push({ id: uid('r'), name, form: F.med.form, qty, phase: F.med.phase, meal: F.med.meal,
      every: Number(F.med.every) || 1, start: dayKeyOf(new Date()), done:false });
    F.med = { name:'', form:'tab', qty:'1', phase: F.med.phase, meal: F.med.meal, every:'1' };
    commitSheet();
    toast('Лекарство добавлено');
  },
  'del-med'(el) { S.meds = S.meds.filter(x => x.id !== el.dataset.id); commitSheet(); },

  /* настройки: стоп-лист */
  'add-stop'() {
    const text = F.stop.trim();
    if (!text) { toast('Введите название'); return; }
    S.stops.push({ id: uid('s'), text, clean:0, slipped:false });
    F.stop = '';
    commitSheet();
    toast('Запрет добавлен');
  },
  'del-stop'(el) { S.stops = S.stops.filter(x => x.id !== el.dataset.id); commitSheet(); },

  /* настройки: установки */
  'add-intent'() {
    const text = F.set.trim();
    if (!text) { toast('Введите текст'); return; }
    S.intentions.unshift({ id: uid('i'), text });
    F.set = '';
    commitSheet();
    toast('Установка добавлена');
  },
  'del-intent'(el) { S.intentions = S.intentions.filter(x => x.id !== el.dataset.id); commitSheet(); },

  /* настройки: желания */
  'pick-photo'(el) { photoTarget = el.dataset.target; $photo.click(); },
  'drop-photo'() { F.wish.photo = ''; renderSheet(); },
  'add-wish'() {
    const text = F.wish.text.trim();
    if (!text) { toast('Введите название'); return; }
    S.wishes.unshift({
      id: uid('w'), text, cat:'', note:'',
      due: F.wish.due, done:false, photo: F.wish.photo,
    });
    if (!save()) { S.wishes[0].photo = ''; save(); }
    F.wish = { text:'', due:'', photo:'' };
    renderSheet();
    toast('Желание добавлено');
  },
  'del-wish'(el) { S.wishes = S.wishes.filter(x => x.id !== el.dataset.id); commitSheet(); },
};

/* удержание чипа «в моменте» (~0,6 с) сбрасывает его счётчик */
const HOLD_MS = 600, HOLD_MOVE = 10;
let holdTimer = null, holdFired = false, holdX = 0, holdY = 0;
function cancelHold() { clearTimeout(holdTimer); holdTimer = null; }
document.addEventListener('pointerdown', e => {
  const chip = e.target.closest('.chip[data-act="moment"]');
  if (!chip) return;
  holdFired = false; holdX = e.clientX; holdY = e.clientY;
  cancelHold();
  holdTimer = setTimeout(() => {
    holdTimer = null; holdFired = true;
    const m = S.moments.find(x => x.id === chip.dataset.id);
    if (!m) return;
    if (m.count) { m.count = 0; commit(); toast('Сброшено'); }
    else toast('Счётчик и так пуст');
  }, HOLD_MS);
});
document.addEventListener('pointermove', e => {
  if (holdTimer && Math.hypot(e.clientX - holdX, e.clientY - holdY) > HOLD_MOVE) cancelHold();  // начали листать
});
document.addEventListener('pointerup', cancelHold);
document.addEventListener('pointercancel', cancelHold);
document.addEventListener('contextmenu', e => { if (e.target.closest('.chip')) e.preventDefault(); });

/* удаление — только по удержанию 2 с, чтобы не снести пункт случайным касанием */
const DEL_MS = 2000;
let delTimer = null, delEl = null, delFired = false, delX = 0, delY = 0;
function cancelDel() {
  clearTimeout(delTimer); delTimer = null;
  if (delEl) { delEl.classList.remove('holding'); delEl = null; }
}
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.del[data-act^="del-"]');
  if (!b) return;
  cancelDel(); delFired = false; delEl = b; delX = e.clientX; delY = e.clientY;
  b.classList.add('holding');
  delTimer = setTimeout(() => {
    delTimer = null; delFired = true; b.classList.remove('holding');
    const fn = ACTIONS[b.dataset.act];
    if (fn) { buzz([30]); fn(b); toast('Удалено'); }
  }, DEL_MS);
});
document.addEventListener('pointermove', e => {
  if (delTimer && Math.hypot(e.clientX - delX, e.clientY - delY) > HOLD_MOVE) cancelDel();
});
document.addEventListener('pointerup', cancelDel);
document.addEventListener('pointercancel', cancelDel);
document.addEventListener('contextmenu', e => { if (e.target.closest('.del')) e.preventDefault(); });

/* делегирование: один слушатель на всё приложение */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.matches('.del[data-act^="del-"]')) {          // клик по корзине сам по себе ничего не удаляет
    e.preventDefault();
    if (delFired) delFired = false; else toast('Удерживайте 2 секунды, чтобы удалить');
    return;
  }
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});

/* поля: пишем в черновик без перерисовки, чтобы не терять фокус */
const MAX_LEN = 200;
function setField(path, value) {
  if (typeof value === 'string') value = value.slice(0, MAX_LEN);
  const [a, b] = path.split('.');
  if (b) F[a][b] = value; else F[a] = value;
}

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.f) { setField(el.dataset.f, el.value); return; }
  if (el.dataset.draft) { S.fields[el.dataset.draft] = el.value.slice(0, MAX_LEN); save(); }
});

/* change ловит то, что не даёт input: выбор в списке и подтверждение даты/времени */
document.addEventListener('change', e => {
  const f = e.target.dataset.f;
  if (!f) return;
  setField(f, e.target.value);
  /* от времени зависит блок дня, от периодичности — набор дней: подсказку надо обновить */
  if (f === 'item.mode' || f === 'item.time' || f === 'med.every') renderSheet();
});

/* Enter в коротких полях */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const f = e.target.dataset?.f;
  if (!f) return;
  e.preventDefault();
  if (f === 'moment') ACTIONS['add-moment']();
  else if (f === 'stop') ACTIONS['add-stop']();
  else if (f === 'set') ACTIONS['add-intent']();
  else if (f.startsWith('item.')) ACTIONS['add-item']();
  else if (f.startsWith('wish.')) ACTIONS['add-wish']();
  else if (f.startsWith('med.')) ACTIONS['add-med']();
});

/* вернулись в приложение — проверяем, не наступил ли новый день */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const before = S.dayKey;
  rollover();
  if (before !== S.dayKey) { render(false); if (sheetOpen) renderSheet(); }
});

/* ============================ старт ============================ */

try {
  rollover();
  render(false);
  splash();
} catch (e) {
  fatal(e && e.message || e);
  throw e;
}

/* Обновления: проверяем при каждом возврате в приложение; когда новая версия
   взяла управление — перезагружаемся один раз, чтобы страница и код совпали. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !navigator.serviceWorker.controller) return;
    reloading = true;
    toast('Обновляю до новой версии');
    setTimeout(() => location.reload(), 600);
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => { /* офлайн-режим просто не включится */ });
  });
}
