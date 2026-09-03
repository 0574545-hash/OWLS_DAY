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

/** Обратное к repeatLabel: по набору дней определяем режим в форме. */
function modeFromDays(days) {
  const d = [...(days || EVERYDAY)].sort((a, b) => a - b);
  const same = arr => arr.length === d.length && arr.every(x => d.includes(x));
  if (same(EVERYDAY)) return 'every';
  if (same(WEEKDAY_SET)) return 'weekdays';
  if (same(WEEKEND_SET)) return 'weekend';
  return 'custom';
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
  if (!$nav.querySelector('button')) {
    $nav.innerHTML = TABS.map(t =>
      '<button data-act="tab" data-tab="' + t.key + '">' +
        svg(t.icon, { size:21, color:'var(--faint)', width:1.8 }) +
        '<span>' + t.label + '</span><i class="ul"></i></button>').join('') +
      '<i class="nav-ul" aria-hidden="true"></i>';
  }
  for (const b of $nav.querySelectorAll('button')) {
    const on = b.dataset.tab === S.tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
    b.querySelector('svg').setAttribute('stroke', on ? 'var(--accent)' : 'var(--faint)');
  }
  moveNavUl();
}
/** Подчёркивание — один элемент на всё меню, переезжает под активную вкладку. */
function moveNavUl() {
  const b = $nav.querySelector('button.on'), ul = $nav.querySelector('.nav-ul');
  const s = b && b.querySelector('.ul');
  if (!s || !ul) return;
  ul.style.transform = 'translate(' + s.offsetLeft + 'px,' + s.offsetTop + 'px)';
  ul.classList.add('ready');
}
/* iOS выдаёт resize при сворачивании панели Safari — не считаем геометрию в кадре прокрутки */
let reflowT = null;
function onViewportChange() {
  clearTimeout(reflowT);
  reflowT = setTimeout(() => { moveNavUl(); fitFx(); }, 120);
}
addEventListener('resize', onViewportChange);
addEventListener('orientationchange', onViewportChange);

/** Подчёркивание между двумя вкладками: k = 0 у первой, 1 у второй. */
function navUlAt(fromKey, toKey, k) {
  const ul = $nav.querySelector('.nav-ul');
  const a = $nav.querySelector('[data-tab="' + fromKey + '"] .ul');
  const b = $nav.querySelector('[data-tab="' + toKey + '"] .ul');
  if (!ul || !a || !b) return;
  ul.style.transform = 'translate(' + (a.offsetLeft + (b.offsetLeft - a.offsetLeft) * k) + 'px,' + a.offsetTop + 'px)';
}

/** Новый экран въезжает со стороны нажатой вкладки; шапка чуть поднимается. */
function switchScreen(dir) {
  render(false, true);
  if (reducedMotion) return;
  $screen.classList.remove('go-l', 'go-r');   // быстрые нажатия подряд: старый класс не должен остаться
  animateOnce($screen, 'go-' + dir);
  animateOnce(document.querySelector('.hd-t'), 'go');
}

/* Кольцо помнит прошлое значение вкладки: рисуем со старого, afterRender доводит до нового. */
const RING = {};
function ringSvg(pct, size, r, w, key) {
  const c = 2 * Math.PI * r;
  const from = key && RING[key] !== undefined ? RING[key] : pct;
  if (key) RING[key] = pct;
  const off = v => (c * (1 - v)).toFixed(1);
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="display:block">' +
    '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="var(--line-soft)" stroke-width="' + w + '"/>' +
    '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="#F26336" stroke-width="' + w +
    '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off(from) +
    '" data-to="' + off(pct) + '" transform="rotate(-90 ' + size/2 + ' ' + size/2 + ')"/></svg>';
}
/** Шапка экрана: кольцо с процентом, счёт и подсказка «дальше». Одинаковая на всех вкладках. */
function ringCard(key, done, total, countText, hint) {
  const pct = total ? done / total : 0;
  const shown = numKey(key);
  const to = Math.round(pct * 100);
  const wide = to === 100 || shown === 100 ? ' w3' : '';   // «100%» не помещается в кольцо крупным кеглем
  return '<div class="card ring-card">' +
    '<div class="ring">' + ringSvg(pct, 78, 31, 8, key) +
      '<div class="pct' + wide + '" data-from="' + shown + '" data-to="' + to + '">' + shown + '%</div></div>' +
    '<div class="grow" style="display:flex;flex-direction:column;gap:6px">' +
      '<span class="done-line">' + esc(countText) + '</span>' +
      '<span class="hint">' + hint + '</span>' +
    '</div></div>';
}
const NUMS = {};
function numKey(key) { const v = NUMS[key]; return v === undefined ? 0 : v; }

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

  let h = ringCard('check', done, total,
    done + ' из ' + total + ' ' + plural(total, 'пункта', 'пунктов', 'пунктов'),
    total === 0 ? 'На сегодня пунктов нет.'
      : next ? 'Дальше: ' + esc(next.text.toLowerCase()) : 'День закрыт полностью. Можно выдохнуть.');

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
          (m.count ? '' : svg('plus', { size:13, color:'var(--faint)', width:2 })) +
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
  const best = S.stops.filter(x => !x.slipped).reduce((a, x) => Math.max(a, x.clean), 0);
  return ringCard('stop', holding, S.stops.length,
      holding + ' из ' + S.stops.length + ' держатся',
      S.stops.some(x => x.slipped) ? 'Один срыв не отменяет день. Отмечайте честно.'
        : best ? 'Ни одного срыва сегодня. Лучшая серия — ' + best + ' ' + plural(best, 'день', 'дня', 'дней') + '.'
        : 'Ни одного срыва сегодня. Так и держите.') +
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
  let h = ringCard('meds', taken, total,
    taken + ' из ' + total + ' ' + plural(total, 'приёма', 'приёмов', 'приёмов'),
    next ? 'Дальше: ' + esc(next.name) + ', ' + medLine(next) : 'Всё принято. На сегодня закрыто.');
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

  let h = ringCard('wish', doneN, S.wishes.length,
    doneN + ' из ' + S.wishes.length + ' ' + plural(S.wishes.length, 'исполнено', 'исполнено', 'исполнено'),
    esc(nearest));

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
        '<span class="row" style="gap:7px;flex:none">' + svg('cal', { size:14, color:'var(--faint)', width:1.5 }) +
          '<span style="font-size:12px;font-weight:600;color:var(--ink-2)">' + (w.due ? fmtDate(w.due) : '—') + '</span>' +
        '</span></div></article>';
  }).join('') + '</div>';
  return h;
}

/* ---------- экран: дневник ---------- */
function viewDiary() {
  const f = S.fields;
  const filled = ['good', 'hard', 'thanks'].filter(k => (f[k] || '').trim()).length;
  const saved = S.entries.length && S.entries[0].date === new Date().getDate() + ' ' + MONTHS[new Date().getMonth()];
  return ringCard('diary', filled, 3, filled + ' из 3 полей',
      saved ? 'Запись за сегодня сохранена.'
        : filled === 3 ? 'Всё заполнено — можно сохранять.'
        : filled ? 'Осталось ' + (3 - filled) + ' ' + plural(3 - filled, 'поле', 'поля', 'полей') + '.'
        : 'Настроение и три строки — весь итог дня.') +
    '<div class="card pad" style="display:flex;flex-direction:column;gap:14px">' +
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
      (editing('entry')
        ? '<div class="btn-row"><button class="save" data-act="save-entry">Обновить запись</button>' +
          '<button class="btn-ghost wide" data-act="edit-cancel">Отменить</button></div>'
        : '<button class="save" data-act="save-entry">Сохранить запись</button>') + '</div>' +
    '<section class="card flush">' +
      '<div class="sec-h"><span class="sec-t">Прошлые записи</span></div>' +
      (S.entries.length ? S.entries.map(e =>
        '<div class="entry' + (editing('entry') && E.id === e.id ? ' editing' : '') +
          '" data-act="edit-entry" data-id="' + e.id + '"><div class="row" style="gap:8px">' +
          '<span class="entry-d">' + esc(e.date) + '</span><span class="tag">' + esc(e.mood) + '</span>' +
          '<span class="grow"></span>' +
          (editing('entry') && E.id === e.id ? '<span class="m-e">правка</span>' : '') +
          trashBtn('del-entry', 'data-id="' + e.id + '"', 'Удалить запись') + '</div>' +
          '<span class="entry-t">' + esc(e.text) + '</span></div>').join('')
        : '<div class="empty">Записей пока нет.</div>') + '</section>';
}

const VIEWS = { check:viewCheck, stop:viewStop, meds:viewMeds, wish:viewWish, diary:viewDiary };

function render(keepScroll, cascade) {
  const y = keepScroll ? $screen.scrollTop : 0;
  const t = TITLES[S.tab] || TITLES.check;
  document.getElementById('eyebrow').textContent = t.eyebrow;
  document.getElementById('title').textContent = t.title;
  document.getElementById('today').textContent = headerDate();
  $screen.innerHTML = (VIEWS[S.tab] || viewCheck)();
  renderNav();
  $screen.scrollTop = y;
  if (cascade && !reducedMotion) cascadeIn();
  afterRender();
}

/* Списки выходят по одному: шаг 30 мс, весь экран собирается примерно за треть секунды. */
const RISE_STEP = 22, RISE_MAX = 8;
function cascadeIn() {
  const rows = $screen.querySelectorAll('.card, .grp-h, .sec-h, .item, .chip, .entry, .streak, .dash');
  let n = 0;
  for (const el of rows) {
    el.style.animationDelay = Math.min(n++, RISE_MAX) * RISE_STEP + 'ms';
    el.classList.add('rise');
    el.addEventListener('animationend', () => { el.classList.remove('rise'); el.style.animationDelay = ''; }, { once: true });
  }
}

/* Кольцо доезжает до нового значения, процент докручивается. */
let numRaf = null;
function afterRender() {
  const c = $screen.querySelector('.ring circle[data-to]');
  if (c) requestAnimationFrame(() => { c.style.strokeDashoffset = c.dataset.to; });
  const pctEl = $screen.querySelector('.pct[data-to]');
  if (!pctEl) return;
  const from = Number(pctEl.dataset.from) || 0, to = Number(pctEl.dataset.to) || 0;
  NUMS[S.tab] = to;
  cancelAnimationFrame(numRaf);
  const put = v => { pctEl.textContent = v + '%'; pctEl.classList.toggle('w3', v >= 100); };
  if (reducedMotion || from === to || document.visibilityState !== 'visible') { put(to); return; }
  const t0 = performance.now(), dur = 500;
  const ease = k => 1 - Math.pow(1 - k, 3);
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    put(Math.round(from + (to - from) * ease(k)));
    if (k < 1) numRaf = requestAnimationFrame(step);
  };
  numRaf = requestAnimationFrame(step);
}

/* ---------- свайп между вкладками ---------- */
/* Экран едет за пальцем; отпустили за четверть ширины — переходим на соседнюю вкладку. */
const SW_PART = 0.25, SW_FAST = 0.45, SW_MIN = 44;
/* Горизонтальный жест требует явного перевеса, вертикальный выигрывает спор:
   листание — движение частое, свайп — редкое. У боковых краёв не начинаем вовсе:
   там хозяин системный жест «назад» Safari, и touch-action ему не помеха. */
const SW_LOCK_X = 16, SW_LOCK_Y = 8, SW_RATIO = 2, SW_EDGE = 28;
let swId = null, swX = 0, swY = 0, swT = 0, swDir = 0, swOn = false, swTo = null, swMoved = false, swTop = 0;

const tabAt = n => (TABS[n] ? TABS[n].key : null);
function neighbour(dx) {
  const i = TABS.findIndex(t => t.key === S.tab);
  return tabAt(dx < 0 ? i + 1 : i - 1);
}
/** Ждём переход именно этого элемента: transitionend всплывает от потомков. */
function onceTransform(el, cb, fallbackMs) {
  let done = false;
  const fin = e => {
    if (e && (e.target !== el || e.propertyName !== 'transform')) return;   // чужой переход — не наш
    if (done) return;
    done = true;
    clearTimeout(t);
    el.removeEventListener('transitionend', fin);
    cb();
  };
  el.addEventListener('transitionend', fin);
  const t = setTimeout(() => fin(null), fallbackMs);
}

function swReset() {
  $screen.classList.remove('swiping');
  $screen.style.transform = '';
  swId = null; swOn = false; swTo = null; swDir = 0;
}
function swCancel() {
  if (!swOn) { swId = null; return; }
  $screen.classList.add('sw-back');
  $screen.style.transform = '';
  navUlAt(S.tab, S.tab, 0);
  onceTransform($screen, () => { $screen.classList.remove('sw-back'); swReset(); }, 300);
  swDropFlag();
  $screen.classList.remove('swiping');
  swOn = false;
}

$screen.addEventListener('pointerdown', e => {
  if (sheetOpen || swId !== null || e.isPrimary === false) return;
  if (e.target.closest('textarea, input, select, .del')) return;
  const w0 = $screen.clientWidth || 1;
  if (e.clientX < SW_EDGE || e.clientX > w0 - SW_EDGE) return;     // край отдаём системе
  swId = e.pointerId; swX = e.clientX; swY = e.clientY; swT = performance.now();
  swDir = 0; swOn = false; swMoved = false; swTo = null;
  swTop = $screen.scrollTop;
});

$screen.addEventListener('pointermove', e => {
  if (e.pointerId !== swId) return;
  const dx = e.clientX - swX, dy = e.clientY - swY;
  if (!swDir) {
    if ($screen.scrollTop !== swTop || Math.abs(dy) > SW_LOCK_Y) { swDir = -1; return; }  // это листание
    if (Math.abs(dx) < SW_LOCK_X || Math.abs(dx) < Math.abs(dy) * SW_RATIO) return;       // ещё не ясно
    swDir = 1;
    swTo = neighbour(dx);
    if (!swTo) { swDir = -1; return; }
    swOn = true; swMoved = true;
    $screen.classList.add('swiping');
    return;
  }
  if (!swOn) return;
  e.preventDefault();
  const w = $screen.clientWidth || 1;
  const to = neighbour(dx);
  if (to !== swTo) { swTo = to; }                          // палец сменил направление
  const lim = swTo ? dx : dx * 0.25;                       // края списка тянутся с сопротивлением
  $screen.style.transform = 'translateX(' + lim + 'px)';
  if (swTo) navUlAt(S.tab, swTo, Math.min(1, Math.abs(dx) / w));
}, { passive: false });

function swEnd(e) {
  if (e.pointerId !== swId) return;
  if (!swOn) { swId = null; return; }
  const dx = e.clientX - swX, w = $screen.clientWidth || 1;
  const v = Math.abs(dx) / Math.max(1, performance.now() - swT);
  const need = Math.max(SW_MIN, w * SW_PART);   // на узком экране порог не должен вырождаться
  const go = swTo && (Math.abs(dx) > need || (v > SW_FAST && Math.abs(dx) > SW_MIN));
  swDropFlag();
  if (!go) { swCancel(); return; }

  const dir = dx < 0 ? 'l' : 'r';
  const next = swTo;
  $screen.classList.remove('swiping');
  $screen.classList.add('sw-out');
  $screen.style.transform = 'translateX(' + (dx < 0 ? -w : w) + 'px)';
  const finish = () => {
    $screen.classList.remove('sw-out');
    $screen.style.transform = '';
    swReset();
    S.tab = next; save();
    switchScreen(dir);
  };
  onceTransform($screen, finish, 260);
}
$screen.addEventListener('pointerup', swEnd);
$screen.addEventListener('pointercancel', e => { if (e.pointerId === swId) swCancel(); });
/* после свайпа палец отпускается над кнопкой — гасим случайный клик, но только его */
$screen.addEventListener('click', e => { if (swMoved) { swMoved = false; e.stopPropagation(); e.preventDefault(); } }, true);
function swDropFlag() { setTimeout(() => { swMoved = false; }, 0); }

/* ============================ настройки ============================ */

const SHEET_TABS = [
  { key:'check', label:'Чек-лист'  },
  { key:'stop',  label:'Стоп-лист' },
  { key:'meds',  label:'Лекарства' },
  { key:'set',   label:'Установки' },
  { key:'wish',  label:'Желания'   },
  { key:'data',  label:'Данные'    },
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

/* Что сейчас правим: {kind, id, phase?, stash?}. null — режим добавления. */
let E = null;
const editing = kind => !!E && E.kind === kind;

/** Заголовок формы: разный для добавления и правки. */
const formTitle = (kind, add, edit) => '<span class="sec-t">' + (editing(kind) ? edit : add) + '</span>';

/** Кнопки формы: «Добавить» либо «Сохранить» + «Отменить». */
const formBtns = (kind, addAct, addLabel) => editing(kind)
  ? '<div class="btn-row"><button class="btn-add" data-act="save-' + kind + '">Сохранить</button>' +
    '<button class="btn-ghost wide" data-act="edit-cancel">Отменить</button></div>'
  : '<button class="btn-add" data-act="' + addAct + '">' + addLabel + '</button>';

/** Класс строки: подсвечиваем ту, что правим. */
const rowCls = (kind, id) => 'mini' + (editing(kind) && E.id === id ? ' editing' : '');

/** Уходим из правки: черновик дневника возвращаем на место. */
function cancelEdit(silent) {
  if (E && E.kind === 'entry' && E.stash) {
    S.fields = E.stash.fields;
    S.mood = E.stash.mood;
  }
  const was = E;
  E = null;
  if (was && !silent) {
    if (was.kind === 'entry') { save(); render(false); }
    else renderSheet();
  }
  return was;
}

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
    formTitle('item', 'Новый пункт', 'Изменить пункт') +
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
    '<span class="note">Блок выбирается по времени. ' + (editing('item') ? 'Пункт будет в' : 'Этот пункт попадёт в') +
      ' <b>' + blkName + '</b>.</span>' +
    formBtns('item', 'add-item', 'Добавить пункт') + '</div>';

  for (const p of PHASES) {
    const list = S.items[p.key];
    if (!list.length) continue;
    h += '<div class="blk">' + p.name + '</div>' + list.map(i =>
      '<div class="' + rowCls('item', i.id) + '" data-act="edit-item" data-phase="' + p.key + '" data-id="' + i.id + '">' +
        '<span class="grow">' +
        '<div class="m-t">' + esc(i.text) + '</div>' +
        '<div class="m-s">' + (i.time ? esc(i.time) + ' · ' : '') + repeatLabel(i.days) + '</div></span>' +
        (editing('item') && E.id === i.id ? '<span class="m-e">правка</span>' : '') +
        trashBtn('del-item', 'data-phase="' + p.key + '" data-id="' + i.id + '"', 'Удалить пункт') + '</div>').join('');
  }

  h += '<div class="blk">В моменте</div>' +
    (editing('moment')
      ? '<div class="form">' + formTitle('moment', '', 'Изменить отметку') +
          '<div class="f"><label for="q-text">Название</label>' +
          '<input id="q-text" type="text" data-f="moment" maxlength="200" value="' + esc(F.moment) + '"></div>' +
          formBtns('moment', 'add-moment', '') + '</div>'
      : '<div class="add"><input type="text" data-f="moment" maxlength="200" value="' + esc(F.moment) +
          '" placeholder="Отметка без времени" enterkeyhint="done">' +
          '<button class="plus" data-act="add-moment" aria-label="Добавить">' + svg('plus', { size:17, color:'#fff', width:2.2 }) +
          '</button></div>') +
    S.moments.map(m => '<div class="' + rowCls('moment', m.id) + '" data-act="edit-moment" data-id="' + m.id + '">' +
      '<span class="grow m-t">' + esc(m.label) + '</span>' +
      (editing('moment') && E.id === m.id ? '<span class="m-e">правка</span>' : '') +
      trashBtn('del-moment', 'data-id="' + m.id + '"', 'Удалить отметку') + '</div>').join('');
  return h;
}

function sheetStop() {
  return '<div class="form">' +
      formTitle('stop', 'Новый запрет', 'Изменить запрет') +
      '<div class="f"><label for="s-text">Чего не делаю</label>' +
        '<input id="s-text" type="text" data-f="stop" maxlength="200" value="' + esc(F.stop) + '" placeholder="Например, телефон в кровати"></div>' +
      formBtns('stop', 'add-stop', 'Добавить запрет') + '</div>' +
    (S.stops.length ? S.stops.map(x =>
      '<div class="' + rowCls('stop', x.id) + '" data-act="edit-stop" data-id="' + x.id + '"><span class="grow">' +
        '<div class="m-t">' + esc(x.text) + '</div>' +
        '<div class="m-s">' + (x.slipped ? 'Сорвался сегодня' : 'Чисто ' + x.clean + ' ' + plural(x.clean, 'день', 'дня', 'дней')) + '</div>' +
      '</span>' + (editing('stop') && E.id === x.id ? '<span class="m-e">правка</span>' : '') +
      trashBtn('del-stop', 'data-id="' + x.id + '"', 'Удалить запрет') + '</div>').join('')
      : '<div class="empty">Пока пусто.</div>');
}

function sheetMeds() {
  const sel = (name, opts, cur) => '<select data-f="med.' + name + '">' +
    Object.entries(opts).map(([v, l]) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  const forms = Object.fromEntries(Object.entries(MED_FORMS).map(([k, v]) => [k, v.label]));
  const phases = Object.fromEntries(PHASES.map(p => [p.key, p.name]));
  const meals = { before:'До еды', with:'Во время еды', after:'После еды' };
  let h = '<div class="form">' +
    formTitle('med', 'Новое лекарство', 'Изменить лекарство') +
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
    (String(F.med.every) !== '1'
      ? '<span class="note">' + (editing('med')
          ? (() => { const m = S.meds.find(x => x.id === E.id); return 'Отсчёт остаётся с ' + (m && m.start ? fmtDate(m.start) : 'дня добавления') + '.'; })()
          : 'Отсчёт с сегодняшнего дня: первый приём — сегодня.') + '</span>'
      : '') +
    formBtns('med', 'add-med', 'Добавить лекарство') + '</div>';
  for (const p of PHASES) {
    const list = S.meds.filter(m => m.phase === p.key);
    if (!list.length) continue;
    h += '<div class="blk">' + p.name + '</div>' + list.map(m =>
      '<div class="' + rowCls('med', m.id) + '" data-act="edit-med" data-id="' + m.id + '"><span class="grow">' +
        '<div class="m-t">' + esc(m.name) + '</div>' +
        '<div class="m-s">' + esc(medLineFull(m)) + (medToday(m) ? '' : ' · следующий через ' + medNextIn(m) + ' ' + plural(medNextIn(m), 'день', 'дня', 'дней')) + '</div></span>' +
        (editing('med') && E.id === m.id ? '<span class="m-e">правка</span>' : '') +
        trashBtn('del-med', 'data-id="' + m.id + '"', 'Удалить лекарство') + '</div>').join('');
  }
  if (!S.meds.length) h += '<div class="empty">Пока пусто.</div>';
  return h;
}

function sheetSet() {
  return '<div class="form">' +
      formTitle('intent', 'Новая установка', 'Изменить установку') +
      '<div class="f"><label for="t-text">Текст</label>' +
        '<input id="t-text" type="text" data-f="set" maxlength="200" value="' + esc(F.set) + '" placeholder="Например, я делаю меньше, но лучше"></div>' +
      '<span class="note">Одна из установок показывается на заставке при запуске.</span>' +
      formBtns('intent', 'add-intent', 'Добавить установку') + '</div>' +
    (S.intentions.length ? S.intentions.map(i =>
      '<div class="' + rowCls('intent', i.id) + '" data-act="edit-intent" data-id="' + i.id + '">' +
      '<span class="grow m-t">' + esc(i.text) + '</span>' +
      (editing('intent') && E.id === i.id ? '<span class="m-e">правка</span>' : '') +
      trashBtn('del-intent', 'data-id="' + i.id + '"', 'Удалить установку') + '</div>').join('')
      : '<div class="empty">Пока пусто.</div>');
}

function sheetWish() {
  const pic = F.wish.photo
    ? '<img class="thumb-lg" src="' + F.wish.photo + '" alt="">'
    : '<span class="thumb-lg ph-empty">Без<br>фото</span>';
  return '<div class="form">' +
      formTitle('wish', 'Новое желание', 'Изменить желание') +
      '<div class="f"><label for="w-text">Название</label>' +
        '<input id="w-text" type="text" data-f="wish.text" maxlength="200" value="' + esc(F.wish.text) + '" placeholder="Например, курс по керамике"></div>' +
      '<div class="f"><label for="w-due">Дата</label>' +
        '<input id="w-due" type="date" data-f="wish.due" value="' + esc(F.wish.due) + '"></div>' +
      '<div class="f"><label>Фото</label><div class="row" style="gap:12px">' + pic +
        '<button class="btn-ghost" data-act="pick-photo" data-target="draft">' +
          svg('photo', { size:16, color:'var(--muted)', width:1.5 }) + '<span>' + (F.wish.photo ? 'Заменить' : 'Выбрать фото') + '</span></button>' +
        (F.wish.photo ? '<button class="btn-ghost" data-act="drop-photo">Убрать</button>' : '') +
      '</div></div>' +
      formBtns('wish', 'add-wish', 'Добавить желание') + '</div>' +
    (S.wishes.length ? S.wishes.map(w => {
      const t = w.photo ? '<img class="thumb" src="' + w.photo + '" alt="">' : '<span class="thumb ph-empty">Нет<br>фото</span>';
      return '<div class="' + rowCls('wish', w.id) + '" data-act="edit-wish" data-id="' + w.id + '">' + t +
        '<span class="grow">' +
        '<div class="m-t">' + esc(w.text) + '</div>' +
        '<div class="m-s">' + (w.due ? 'до ' + fmtDate(w.due) : 'без даты') + (w.done ? ' · исполнено' : '') + '</div></span>' +
        (editing('wish') && E.id === w.id ? '<span class="m-e">правка</span>' : '') +
        trashBtn('del-wish', 'data-id="' + w.id + '"', 'Удалить желание') + '</div>';
    }).join('') : '<div class="empty">Пока пусто.</div>');
}

const SHEET_VIEWS = { check:sheetCheck, stop:sheetStop, meds:sheetMeds, set:sheetSet, wish:sheetWish, data:sheetData };

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
  cancelEdit(true);
  sheetOpen = false;
  $sheet.classList.remove('open');
  $sheet.setAttribute('aria-hidden', 'true');
  render(true);
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
function fitFx() {
  if (!$fx) return;
  dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if ($fx.width === w && $fx.height === h) return;      // без изменений не переаллоцируем
  $fx.width = w; $fx.height = h;
}
fitFx();
const FX_COLORS = ['#F26336','#F26336','#0B1E35','#FFD9CC','#E5DCC9','#F9A98A'];

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
  const off = e => {                                   // animationend тоже всплывает от потомков
    if (e.target !== el) return;
    el.classList.remove(cls);
    el.removeEventListener('animationend', off);
  };
  el.addEventListener('animationend', off);
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
  tab(el) {
    cancelEdit(true);
    const next = el.dataset.tab;
    if (next === S.tab) { $screen.scrollTo({ top:0, behavior: reducedMotion ? 'auto' : 'smooth' }); return; }
    const dir = TABS.findIndex(t => t.key === next) > TABS.findIndex(t => t.key === S.tab) ? 'l' : 'r';
    S.tab = next; save();
    switchScreen(dir);
  },
  settings() { openSheet(); },
  'close-settings'() { closeSheet(); },
  'sheet-tab'(el) { cancelEdit(true); sheetTab = el.dataset.tab; renderSheet(); },

  /* главный экран */
  item(el) {
    const i = S.items[el.dataset.phase].find(x => x.id === el.dataset.id);
    if (!i) return;
    i.done = !i.done;
    if (i.done) splashAt(el.querySelector('.box'));
    commit();
    if (i.done) animateOnce($screen.querySelector('.ring-card'), 'nudge');
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
    const parts = { good:(f.good || '').trim(), hard:(f.hard || '').trim(), thanks:(f.thanks || '').trim() };
    const text = [parts.good, parts.hard, parts.thanks].filter(Boolean).join(' · ');
    if (!text) { toast('Заполните хотя бы одно поле'); return; }
    if (editing('entry')) {
      const e = S.entries.find(x => x.id === E.id);
      if (e) { e.text = text; e.parts = parts; e.mood = MOODS[S.mood]; }
      S.fields = E.stash.fields; S.mood = E.stash.mood;
      E = null;
      commit(false);
      toast('Запись обновлена');
      return;
    }
    const d = new Date();
    S.entries.unshift({ id: uid('x'), date: d.getDate() + ' ' + MONTHS[d.getMonth()], mood: MOODS[S.mood], text, parts });
    S.fields = { good:'', hard:'', thanks:'' };
    splashAt(document.querySelector('[data-act="save-entry"]'));
    commit(false);
    toast('Запись сохранена');
  },
  'del-entry'(el) {
    if (editing('entry') && E.id === el.dataset.id) cancelEdit(true);
    S.entries = S.entries.filter(x => x.id !== el.dataset.id);
    commit();
  },
  'edit-entry'(el) {
    const e = S.entries.find(x => x.id === el.dataset.id);
    if (!e) return;
    if (editing('entry') && E.id === e.id) { ACTIONS['edit-cancel'](); return; }
    const stash = editing('entry') ? E.stash : { fields: { ...S.fields }, mood: S.mood };
    E = { kind:'entry', id:e.id, stash };
    const p = e.parts || { good: e.text || '', hard:'', thanks:'' };
    S.fields = { good:p.good || '', hard:p.hard || '', thanks:p.thanks || '' };
    const mi = MOODS.indexOf(e.mood);
    if (mi >= 0) S.mood = mi;
    render(false);
  },

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
    if (editing('item') && E.id === el.dataset.id) ACTIONS['edit-cancel']();
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
  'del-moment'(el) {
    if (editing('moment') && E.id === el.dataset.id) ACTIONS['edit-cancel']();
    S.moments = S.moments.filter(x => x.id !== el.dataset.id);
    commitSheet();
  },

  /* лекарства */
  med(el) {
    const m = S.meds.find(x => x.id === el.dataset.id);
    if (!m) return;
    m.done = !m.done;
    if (m.done) splashAt(el.querySelector('.box'));
    commit();
    if (m.done) animateOnce($screen.querySelector('.ring-card'), 'nudge');
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
  'del-med'(el) {
    if (editing('med') && E.id === el.dataset.id) ACTIONS['edit-cancel']();
    S.meds = S.meds.filter(x => x.id !== el.dataset.id);
    commitSheet();
  },

  /* настройки: стоп-лист */
  'add-stop'() {
    const text = F.stop.trim();
    if (!text) { toast('Введите название'); return; }
    S.stops.push({ id: uid('s'), text, clean:0, slipped:false });
    F.stop = '';
    commitSheet();
    toast('Запрет добавлен');
  },
  'del-stop'(el) {
    if (editing('stop') && E.id === el.dataset.id) ACTIONS['edit-cancel']();
    S.stops = S.stops.filter(x => x.id !== el.dataset.id);
    commitSheet();
  },

  /* настройки: установки */
  'add-intent'() {
    const text = F.set.trim();
    if (!text) { toast('Введите текст'); return; }
    S.intentions.unshift({ id: uid('i'), text });
    F.set = '';
    commitSheet();
    toast('Установка добавлена');
  },
  'del-intent'(el) {
    if (editing('intent') && E.id === el.dataset.id) ACTIONS['edit-cancel']();
    S.intentions = S.intentions.filter(x => x.id !== el.dataset.id);
    commitSheet();
  },

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
  'del-wish'(el) {
    if (editing('wish') && E.id === el.dataset.id) ACTIONS['edit-cancel']();
    S.wishes = S.wishes.filter(x => x.id !== el.dataset.id);
    commitSheet();
  },

  /* правка позиций */
  'edit-cancel'() {
    if (E) {
      if (E.kind === 'item') F.item = { text:'', time:'', mode:'every', days:[...EVERYDAY] };
      else if (E.kind === 'moment') F.moment = '';
      else if (E.kind === 'stop') F.stop = '';
      else if (E.kind === 'intent') F.set = '';
      else if (E.kind === 'med') F.med = { name:'', form:'tab', qty:'1', phase:F.med.phase, meal:F.med.meal, every:'1' };
      else if (E.kind === 'wish') F.wish = { text:'', due:'', photo:'' };
    }
    cancelEdit();
  },
  'edit-item'(el) {
    const phase = el.dataset.phase;
    const i = (S.items[phase] || []).find(x => x.id === el.dataset.id);
    if (!i) return;
    if (editing('item') && E.id === i.id) { ACTIONS['edit-cancel'](); return; }
    E = { kind:'item', id:i.id, phase };
    F.item = { text:i.text, time:i.time || '', mode:modeFromDays(i.days), days:[...(i.days || EVERYDAY)] };
    renderSheet(); $sheetBody.scrollTop = 0;
  },
  'save-item'() {
    const text = F.item.text.trim();
    if (!text) { toast('Введите название'); return; }
    const days = daysFromMode();
    if (!days.length) { toast('Выберите хотя бы один день'); return; }
    const from = E.phase;
    const idx = (S.items[from] || []).findIndex(x => x.id === E.id);
    if (idx < 0) { ACTIONS['edit-cancel'](); return; }
    const upd = { ...S.items[from][idx], text, time:F.item.time, days };
    const to = phaseOfTime(F.item.time);
    S.items[from].splice(idx, 1);
    S.items[to].push(upd);
    S.items[to].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    F.item = { text:'', time:'', mode:'every', days:[...EVERYDAY] };
    E = null;
    commitSheet();
    toast(from === to ? 'Пункт изменён' : 'Переехал в ' + PHASES.find(p => p.key === to).name.toLowerCase());
  },
  'edit-moment'(el) {
    const m = S.moments.find(x => x.id === el.dataset.id);
    if (!m) return;
    if (editing('moment') && E.id === m.id) { ACTIONS['edit-cancel'](); return; }
    E = { kind:'moment', id:m.id };
    F.moment = m.label;
    renderSheet();
  },
  'save-moment'() {
    const t = F.moment.trim();
    if (!t) { toast('Введите название'); return; }
    const m = S.moments.find(x => x.id === E.id);
    if (m) m.label = t;
    F.moment = ''; E = null;
    commitSheet(); toast('Отметка изменена');
  },
  'edit-stop'(el) {
    const x = S.stops.find(y => y.id === el.dataset.id);
    if (!x) return;
    if (editing('stop') && E.id === x.id) { ACTIONS['edit-cancel'](); return; }
    E = { kind:'stop', id:x.id };
    F.stop = x.text;
    renderSheet(); $sheetBody.scrollTop = 0;
  },
  'save-stop'() {
    const t = F.stop.trim();
    if (!t) { toast('Введите название'); return; }
    const x = S.stops.find(y => y.id === E.id);
    if (x) x.text = t;
    F.stop = ''; E = null;
    commitSheet(); toast('Запрет изменён');
  },
  'edit-intent'(el) {
    const i = S.intentions.find(x => x.id === el.dataset.id);
    if (!i) return;
    if (editing('intent') && E.id === i.id) { ACTIONS['edit-cancel'](); return; }
    E = { kind:'intent', id:i.id };
    F.set = i.text;
    renderSheet(); $sheetBody.scrollTop = 0;
  },
  'save-intent'() {
    const t = F.set.trim();
    if (!t) { toast('Введите текст'); return; }
    const i = S.intentions.find(x => x.id === E.id);
    if (i) i.text = t;
    F.set = ''; E = null;
    commitSheet(); toast('Установка изменена');
  },
  'edit-med'(el) {
    const m = S.meds.find(x => x.id === el.dataset.id);
    if (!m) return;
    if (editing('med') && E.id === m.id) { ACTIONS['edit-cancel'](); return; }
    E = { kind:'med', id:m.id };
    F.med = { name:m.name, form:m.form, qty:String(m.qty), phase:m.phase, meal:m.meal, every:String(m.every || 1) };
    renderSheet(); $sheetBody.scrollTop = 0;
  },
  'save-med'() {
    const name = F.med.name.trim();
    if (!name) { toast('Введите название'); return; }
    const m = S.meds.find(x => x.id === E.id);
    if (!m) { ACTIONS['edit-cancel'](); return; }
    m.name = name;
    m.form = F.med.form;
    m.qty = Math.min(99, Math.max(1, Math.round(Number(F.med.qty) || 1)));
    m.phase = F.med.phase;
    m.meal = F.med.meal;
    m.every = Number(F.med.every) || 1;
    F.med = { name:'', form:'tab', qty:'1', phase:m.phase, meal:m.meal, every:'1' };
    E = null;
    commitSheet(); toast('Лекарство изменено');
  },
  'edit-wish'(el) {
    const w = S.wishes.find(x => x.id === el.dataset.id);
    if (!w) return;
    if (editing('wish') && E.id === w.id) { ACTIONS['edit-cancel'](); return; }
    E = { kind:'wish', id:w.id };
    F.wish = { text:w.text, due:w.due || '', photo:w.photo || '' };
    renderSheet(); $sheetBody.scrollTop = 0;
  },
  'save-wish'() {
    const t = F.wish.text.trim();
    if (!t) { toast('Введите название'); return; }
    const w = S.wishes.find(x => x.id === E.id);
    if (!w) { ACTIONS['edit-cancel'](); return; }
    const oldPhoto = w.photo;
    w.text = t; w.due = F.wish.due; w.photo = F.wish.photo;
    const ok = save();
    if (!ok) { w.photo = oldPhoto; save(); }
    F.wish = { text:'', due:'', photo:'' };
    E = null;
    renderSheet();
    toast(ok ? 'Желание изменено' : 'Фото не поместилось — остальное сохранено');
  },

  /* настройки: данные */
  'xl-export'() {
    try { deliverFile(xlExport(), 'owls-day-' + dayKeyOf(new Date()) + '.xlsx'); }
    catch (e) { toast('Не удалось собрать файл: ' + (e && e.message || e)); }
  },
  'xl-import'() { $xlsx.click(); },
};

/* удержание чипа «в моменте» (~0,6 с) сбрасывает его счётчик */
const HOLD_MS = 600, HOLD_MOVE = 6;
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

/* удаление — только по удержанию 1 с, чтобы не снести пункт случайным касанием */
const DEL_MS = 1000;
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
/* начали листать — оба удержания отпускаем, иначе заливка корзины идёт под пальцем */
const onAnyScroll = () => { cancelHold(); cancelDel(); };
$screen.addEventListener('scroll', onAnyScroll, { passive: true });
$sheetBody.addEventListener('scroll', onAnyScroll, { passive: true });
document.addEventListener('pointercancel', cancelDel);
document.addEventListener('contextmenu', e => { if (e.target.closest('.del')) e.preventDefault(); });

/* делегирование: один слушатель на всё приложение */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.matches('.del[data-act^="del-"]')) {          // клик по корзине сам по себе ничего не удаляет
    e.preventDefault();
    if (delFired) delFired = false; else toast('Удерживайте секунду, чтобы удалить');
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

/* ============================ Excel: экспорт и импорт ============================ */
/* Свой минимальный xlsx: zip без сжатия на запись, DecompressionStream на чтение. Без библиотек. */

const XL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XL_SHEETS = {
  check:  { name:'Чек-лист',  cols:['Блок','Пункт','Время','Дни'],            w:[10,36,9,22] },
  moment: { name:'В моменте', cols:['Отметка'],                                 w:[36] },
  stop:   { name:'Стоп-лист', cols:['Запрет','Чисто дней'],                    w:[36,12] },
  meds:   { name:'Лекарства', cols:['Название','Форма','Количество','Когда','Приём','Частота','Начало'], w:[28,11,12,9,15,14,12] },
  set:    { name:'Установки', cols:['Текст'],                                   w:[48] },
  wish:   { name:'Желания',   cols:['Желание','Категория','Заметка','Дата','Исполнено'], w:[36,14,24,12,11] },
  diary:  { name:'Дневник',   cols:['Дата','Настроение','Запись'],             w:[14,12,60] },
  hist:   { name:'История',   cols:['Дата'],                                   w:[14] },
};
const XL_HINT = {
  check:  'Блок: Утро / День / Вечер. Время ЧЧ:ММ. Дни: «Каждый день», «Будни», «Выходные» или «пн, ср, пт».',
  moment: 'По одной отметке в строке.',
  stop:   'Чисто дней — число; можно оставить пустым.',
  meds:   'Форма: Таблетка / Капли / Порция. Приём: до еды / во время еды / после еды. Частота: Ежедневно / Через день / Раз в 3 дня / Раз в неделю.',
  set:    'По одной установке в строке.',
  wish:   'Дата — ГГГГ-ММ-ДД или обычная дата Excel. Исполнено: да / нет.',
  diary:  'Записи как есть: дата текстом, настроение — одно из: ' + MOODS.join(', ') + '.',
  hist:   'Дни, когда была хотя бы одна отметка. Влияет на серию.',
};

/* ---------- zip ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** Собираем zip без сжатия (метод 0) — читается всем, а размеры тут крошечные. */
function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [], cd = [];
  let off = 0;
  for (const f of files) {
    const n = enc.encode(f.name), d = f.data, crc = crc32(d);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true);
    lh.setUint16(26, n.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), n, d);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true);
    ch.setUint16(28, n.length, true); ch.setUint32(42, off, true);
    cd.push(new Uint8Array(ch.buffer), n);
    off += 30 + n.length + d.length;
  }
  const cdSize = cd.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], { type: XL_MIME });
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Этот браузер не умеет распаковывать xlsx — обновите систему');
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(data); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/** Читаем zip: имя → байты. Размеры берём из центрального каталога — он надёжнее локальных заголовков. */
async function zipRead(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Это не файл xlsx');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true);
    const data = u8.slice(start, start + csize);
    if (method === 0) out[name] = data;
    else if (method === 8) out[name] = await inflateRaw(data);
    else throw new Error('Файл сжат неподдерживаемым способом');
    p += 46 + nlen + elen + clen;
  }
  return out;
}

/* ---------- xlsx ---------- */
const xmlEsc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
const colName = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
const colIndex = ref => { let n = 0; for (const ch of ref) { if (ch < 'A' || ch > 'Z') break; n = n * 26 + ch.charCodeAt(0) - 64; } return n - 1; };

/** sheets: [{ name, rows:[[…]], w:[ширины] }] → Blob. Строки — inlineStr, числа — числа. */
function xlsxBuild(sheets) {
  const enc = new TextEncoder();
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = [];
  const sheetXml = sh => {
    const cols = sh.w ? '<cols>' + sh.w.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' : '';
    const rows = sh.rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
      const ref = colName(ci) + (ri + 1);
      if (typeof v === 'number' && Number.isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>';
      if (v === '' || v == null) return '';
      return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
    }).join('') + '</row>').join('');
    return head + '<worksheet xmlns="' + NS + '">' + cols + '<sheetData>' + rows + '</sheetData></worksheet>';
  };
  files.push({ name:'[Content_Types].xml', data: enc.encode(head +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
    '</Types>') });
  files.push({ name:'_rels/.rels', data: enc.encode(head +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="xl/workbook.xml"/></Relationships>') });
  files.push({ name:'xl/workbook.xml', data: enc.encode(head +
    '<workbook xmlns="' + NS + '" xmlns:r="' + REL + '"><sheets>' +
    sheets.map((s, i) => '<sheet name="' + xmlEsc(s.name).replace(/"/g, '&quot;') + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
    '</sheets></workbook>') });
  files.push({ name:'xl/_rels/workbook.xml.rels', data: enc.encode(head +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + REL + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
    '</Relationships>') });
  sheets.forEach((s, i) => files.push({ name:'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc.encode(sheetXml(s)) }));
  return zipStore(files);
}

/** ArrayBuffer → { имяЛиста: [[ячейки…], …] }. Понимает общие строки, inline-строки, числа, булевы. */
async function xlsxParse(buf) {
  const z = await zipRead(buf);
  const dec = new TextDecoder();
  const xml = n => {
    const d = z[n]; if (!d) return null;
    const doc = new DOMParser().parseFromString(dec.decode(d), 'application/xml');
    return doc.getElementsByTagName('parsererror').length ? null : doc;
  };
  const all = (el, tag) => Array.from(el.getElementsByTagNameNS('*', tag));
  const wb = xml('xl/workbook.xml');
  if (!wb) throw new Error('В файле нет книги Excel');
  const relMap = {};
  const rels = xml('xl/_rels/workbook.xml.rels');
  if (rels) for (const r of all(rels, 'Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
  const sst = [];
  const ss = xml('xl/sharedStrings.xml');
  if (ss) for (const si of all(ss, 'si')) sst.push(all(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join(''));
  const out = {};
  for (const sh of all(wb, 'sheet')) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = relMap[rid] || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    const doc = xml(target);
    if (!doc) continue;
    const rows = [];
    for (const row of all(doc, 'row')) {
      const r = [];
      let ci = 0;
      for (const c of all(row, 'c')) {
        const ref = c.getAttribute('r');
        if (ref) ci = colIndex(ref);
        const t = c.getAttribute('t'), v = all(c, 'v')[0];
        let val = '';
        if (t === 's') val = sst[Number(v && v.textContent)] ?? '';
        else if (t === 'inlineStr') val = all(c, 't').map(x => x.textContent).join('');
        else if (t === 'b') val = v && v.textContent === '1' ? 'да' : 'нет';
        else if (t === 'str' || t === 'e') val = v ? v.textContent : '';
        else if (v) { const n = Number(v.textContent); val = Number.isFinite(n) ? n : v.textContent; }
        r[ci] = val;
        ci++;
      }
      rows.push(r);
    }
    out[sh.getAttribute('name')] = rows;
  }
  return out;
}

/* ---------- значения ячеек ---------- */
const cellStr = v => (typeof v === 'number' ? String(v) : String(v ?? '')).trim().slice(0, MAX_LEN);
const norm = s => cellStr(s).toLowerCase().replace(/ё/g, 'е');
/** Дата из ячейки: серийное число Excel, ГГГГ-ММ-ДД или ДД.ММ.ГГГГ → ключ дня. */
function cellDay(v) {
  if (typeof v === 'number') {
    if (v < 1) return '';
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  const s = cellStr(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return m[3] + '-' + pad2(+m[2]) + '-' + pad2(+m[1]);
  return '';
}
/** Время: доля суток Excel или «7:00» → «07:00». */
function cellTime(v) {
  if (typeof v === 'number') {
    const mins = Math.round((v - Math.floor(v)) * 1440) % 1440;
    return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }
  const m = cellStr(v).match(/^(\d{1,2}):(\d{2})/);
  return m ? pad2(Math.min(23, +m[1])) + ':' + m[2] : '';
}
function cellDays(v) {
  const s = norm(v);
  if (!s || s === 'каждый день' || s === 'ежедневно') return [...EVERYDAY];
  if (s === 'будни') return [...WEEKDAY_SET];
  if (s === 'выходные') return [...WEEKEND_SET];
  const out = [];
  for (const part of s.split(/[,;\s]+/)) {
    const d = DOW.find(x => x.s === part.slice(0, 2));
    if (d && !out.includes(d.n)) out.push(d.n);
  }
  return out.length ? out : [...EVERYDAY];
}
const cellYes = v => /^(да|yes|true|1|\+|✓|x|х)$/.test(norm(v));
const keyOf = (obj, s) => Object.keys(obj).find(k => norm(obj[k].label ?? obj[k].name ?? obj[k]) === norm(s));

/* ---------- экспорт ---------- */
function xlExportRows() {
  const phaseName = k => (PHASES.find(p => p.key === k) || PHASES[1]).name;
  return {
    check:  PHASES.flatMap(p => S.items[p.key].map(i => [p.name, i.text, i.time || '', repeatLabel(i.days)])),
    moment: S.moments.map(m => [m.label]),
    stop:   S.stops.map(x => [x.text, x.clean]),
    meds:   S.meds.map(m => [m.name, (MED_FORMS[m.form] || MED_FORMS.tab).label, m.qty, phaseName(m.phase),
              MED_MEAL[m.meal] || MED_MEAL.after, MED_EVERY[Number(m.every) || 1], m.start || '']),
    set:    S.intentions.map(i => [i.text]),
    wish:   S.wishes.map(w => [w.text, w.cat || '', w.note || '', w.due || '', w.done ? 'да' : 'нет']),
    diary:  S.entries.map(e => [e.date, e.mood, e.text]),
    hist:   [...S.history].sort().map(d => [d]),
  };
}
function xlExport() {
  const data = xlExportRows();
  const sheets = Object.keys(XL_SHEETS).map(k => ({ name: XL_SHEETS[k].name, w: XL_SHEETS[k].w, rows: [XL_SHEETS[k].cols, ...data[k]] }));
  return xlsxBuild(sheets);
}
/** На iPhone файл уходит через «Поделиться» (иначе PWA его не сохранит), на остальных — обычная загрузка. */
function deliverFile(blob, name) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && navigator.canShare) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare({ files:[file] })) {
      navigator.share({ files:[file], title: name }).catch(() => {});
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---------- импорт ---------- */
/** Лист → строки-объекты по заголовкам; null, если листа нет или заголовок не совпал. */
function xlTable(book, key) {
  const def = XL_SHEETS[key];
  const name = Object.keys(book).find(n => norm(n) === norm(def.name));
  if (!name) return null;
  const rows = book[name];
  if (!rows.length) return [];
  const head = rows[0].map(norm);
  const idx = def.cols.map(c => head.indexOf(norm(c)));
  if (idx[0] < 0) return null;
  return rows.slice(1)
    .map(r => Object.fromEntries(def.cols.map((c, i) => [i, idx[i] < 0 ? '' : (r[idx[i]] ?? '')])))
    .filter(o => cellStr(o[0]) !== '');
}
/** Старый элемент с тем же текстом остаётся (id, отметки, фото), новый — создаётся. */
function pickOld(list, text, field) {
  const k = norm(text);
  const i = list.findIndex(x => norm(x[field]) === k);
  return i < 0 ? null : list.splice(i, 1)[0];
}

function xlImport(book) {
  const today = dayKeyOf(new Date());
  const done = [];
  let t;

  if ((t = xlTable(book, 'check'))) {
    const pool = PHASES.flatMap(p => S.items[p.key]);
    const items = { morning:[], day:[], evening:[] };
    for (const r of t) {
      const time = cellTime(r[2]);
      const phase = (PHASES.find(p => norm(p.name) === norm(r[0])) || { key: phaseOfTime(time) }).key;
      const old = pickOld(pool, r[1], 'text');
      items[phase].push({ id: old ? old.id : uid(phase), text: cellStr(r[1]), time, days: cellDays(r[3]), done: old ? !!old.done : false });
    }
    for (const p of PHASES) items[p.key].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    S.items = items;
    done.push('чек-лист ' + t.length);
  }
  if ((t = xlTable(book, 'moment'))) {
    const pool = S.moments;
    S.moments = t.map(r => { const old = pickOld(pool, r[0], 'label'); return { id: old ? old.id : uid('q'), label: cellStr(r[0]), count: old ? old.count : 0 }; });
    done.push('в моменте ' + t.length);
  }
  if ((t = xlTable(book, 'stop'))) {
    const pool = S.stops;
    S.stops = t.map(r => {
      const old = pickOld(pool, r[0], 'text');
      const n = typeof r[1] === 'number' ? Math.max(0, Math.round(r[1])) : (cellStr(r[1]) ? Number(cellStr(r[1])) : NaN);
      return { id: old ? old.id : uid('s'), text: cellStr(r[0]), clean: Number.isFinite(n) ? n : (old ? old.clean : 0), slipped: old ? !!old.slipped : false };
    });
    done.push('стоп-лист ' + t.length);
  }
  if ((t = xlTable(book, 'meds'))) {
    const pool = S.meds;
    S.meds = t.map(r => {
      const old = pickOld(pool, r[0], 'name');
      const every = Number(keyOf(MED_EVERY, r[5]) || cellStr(r[5]).match(/\d+/)?.[0] || (old ? old.every : 1)) || 1;
      return {
        id: old ? old.id : uid('r'), name: cellStr(r[0]),
        form: keyOf(MED_FORMS, r[1]) || (old ? old.form : 'tab'),
        qty: Math.min(99, Math.max(1, Math.round(Number(r[2]) || (old ? old.qty : 1)))),
        phase: (PHASES.find(p => norm(p.name) === norm(r[3])) || { key: old ? old.phase : 'morning' }).key,
        meal: keyOf(MED_MEAL, r[4]) || (old ? old.meal : 'after'),
        every, start: cellDay(r[6]) || (old ? old.start : today), done: old ? !!old.done : false,
      };
    });
    done.push('лекарства ' + t.length);
  }
  if ((t = xlTable(book, 'set'))) {
    const pool = S.intentions;
    S.intentions = t.map(r => { const old = pickOld(pool, r[0], 'text'); return { id: old ? old.id : uid('i'), text: cellStr(r[0]) }; });
    done.push('установки ' + t.length);
  }
  if ((t = xlTable(book, 'wish'))) {
    const pool = S.wishes;
    S.wishes = t.map(r => {
      const old = pickOld(pool, r[0], 'text');
      const isDone = cellYes(r[4]);
      return { id: old ? old.id : uid('w'), text: cellStr(r[0]), cat: cellStr(r[1]), note: cellStr(r[2]), due: cellDay(r[3]),
        done: isDone, doneAt: isDone ? (old && old.doneAt) || today : undefined, photo: old ? old.photo || '' : '' };
    });
    done.push('желания ' + t.length);
  }
  if ((t = xlTable(book, 'diary'))) {
    S.entries = t.map(r => ({ id: uid('x'), date: cellStr(r[0]), mood: MOODS.find(m => norm(m) === norm(r[1])) || cellStr(r[1]), text: cellStr(r[2]).slice(0, MAX_LEN * 3) }));
    done.push('дневник ' + t.length);
  }
  if ((t = xlTable(book, 'hist'))) {
    const days = t.map(r => cellDay(r[0])).filter(d => d && d < today);
    S.history = [...new Set([...S.history, ...days])].sort().slice(-400);
    done.push('история ' + days.length);
  }
  return done;
}

const $xlsx = document.getElementById('xlsx-input');
$xlsx.addEventListener('change', async () => {
  const file = $xlsx.files && $xlsx.files[0];
  $xlsx.value = '';
  if (!file) return;
  try {
    const book = await xlsxParse(await file.arrayBuffer());
    const known = Object.values(XL_SHEETS).filter(d => Object.keys(book).some(n => norm(n) === norm(d.name)));
    if (!known.length) { toast('В файле нет знакомых листов'); return; }
    if (!confirm('Заменить списки данными из файла?\nЛисты: ' + known.map(d => d.name).join(', ') + '.\nФото и сегодняшние отметки у совпадающих пунктов сохранятся.')) return;
    const done = xlImport(book);
    save();
    renderSheet();
    toast('Загружено: ' + done.join(', '));
  } catch (e) {
    console.warn(e);
    toast('Не удалось прочитать файл: ' + (e && e.message || e));
  }
});

function sheetData() {
  return '<div class="form">' +
      '<span class="sec-t">Excel</span>' +
      '<span class="note">Один файл .xlsx со всеми списками и историей. Скачайте его как шаблон, отредактируйте в Excel или Numbers и загрузите обратно.</span>' +
      '<button class="btn-add" data-act="xl-export">Скачать Excel</button>' +
      '<button class="btn-ghost" data-act="xl-import" style="justify-content:center">Загрузить из Excel</button>' +
      '<span class="note">При загрузке каждый лист заменяет свой список целиком. Листы, которых нет в файле, не трогаются. Фото желаний и сегодняшние отметки у пунктов с тем же названием сохраняются.</span>' +
    '</div>' +
    '<div class="blk">Листы шаблона</div>' +
    Object.keys(XL_SHEETS).map(k =>
      '<div class="mini"><span class="grow">' +
        '<div class="m-t">' + esc(XL_SHEETS[k].name) + ' <span style="color:var(--faint)">· ' + esc(XL_SHEETS[k].cols.join(', ')) + '</span></div>' +
        '<div class="m-s">' + esc(XL_HINT[k]) + '</div></span></div>').join('');
}

/* ============================ старт ============================ */

try {
  rollover();
  render(false, true);
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
