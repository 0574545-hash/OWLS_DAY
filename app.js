/* Трекер дня — OWLS.  Автономное веб-приложение, без сборки и без зависимостей. */
'use strict';

/* ============================ утилиты ============================ */

const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const MOODS = ['Тяжело','Никак','Ровно','Хорошо','Ясно'];
const PHASES = [
  { key:'morning', name:'Утро',  placeholder:'Добавить в утро'  },
  { key:'day',     name:'День',  placeholder:'Добавить в день'  },
  { key:'evening', name:'Вечер', placeholder:'Добавить в вечер' },
];
const TITLES = {
  check: { eyebrow:'Чек-лист',   title:'День по частям' },
  stop:  { eyebrow:'Стоп-лист',  title:'Не сегодня'     },
  set:   { eyebrow:'Установки',  title:'Настройка'      },
  wish:  { eyebrow:'Wish list',  title:'Желания'        },
  diary: { eyebrow:'Дневник дня',title:'Итог дня'       },
};

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
  repeat:'<path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2"/><path d="M18 3v3.5h-3.5M6 21v-3.5h3.5"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>',
  trash:'<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
};
/** svg(name, {size, color, width}) */
function svg(name, o = {}) {
  const s = o.size || 20, c = o.color || 'currentColor', w = o.width || 1.6;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="' + c +
    '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
}

/* ============================ состояние ============================ */

const KEY = 'owls.day-tracker.v1';

function seed() {
  return {
    tab: 'check',
    dayKey: dayKeyOf(new Date()),
    items: {
      morning: [
        { id:'m1', text:'Стакан воды',             time:'07:00', done:false },
        { id:'m2', text:'Зарядка 15 минут',        time:'07:20', done:false },
        { id:'m3', text:'Прочитать установку дня', time:'07:40', done:false },
        { id:'m4', text:'Завтрак без телефона',    time:'08:10', done:false },
      ],
      day: [
        { id:'d1', text:'Три главные задачи',   time:'10:00', done:false },
        { id:'d2', text:'Прогулка 30 минут',    time:'13:00', done:false },
        { id:'d3', text:'Без сахара до вечера', time:'',      done:false },
        { id:'d4', text:'Разобрать входящие',   time:'17:00', done:false },
      ],
      evening: [
        { id:'e1', text:'Растяжка 10 минут',          time:'21:00', done:false },
        { id:'e2', text:'Дневник дня',                time:'21:30', done:false },
        { id:'e3', text:'Телефон в другую комнату',   time:'22:30', done:false },
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
      { id:'i1', text:'Я делаю меньше, но лучше.',   reps:0 },
      { id:'i2', text:'Спокойствие — это скорость.', reps:0 },
      { id:'i3', text:'Тело первое, задачи вторые.', reps:0 },
      { id:'i4', text:'Я замечаю то, что уже есть.', reps:0 },
    ],
    active: 'i1',
    wishes: [
      { id:'w1', text:'Полка для книг у окна',           cat:'Дом',          note:'Дуб, 180 см',        due:'', done:false },
      { id:'w2', text:'Пробежать 10 км без остановки',   cat:'Тело',         note:'Сейчас 6,5 км',      due:'', done:false },
      { id:'w3', text:'Поехать в Тбилиси на неделю',     cat:'Путешествия',  note:'Вдвоём, 7 дней',     due:'', done:false },
    ],
    stops: [
      { id:'s1', text:'Телефон в кровати',          clean:0, slipped:false },
      { id:'s2', text:'Сериалы в рабочее время',    clean:0, slipped:false },
      { id:'s3', text:'Сладкое после 19:00',        clean:0, slipped:false },
    ],
    mood: 2,
    fields: { good:'', hard:'', thanks:'' },
    entries: [],
    history: [],           // дни, в которые был отмечен хотя бы один пункт
  };
}

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const s = Object.assign(seed(), JSON.parse(raw));
    // подстраховка на случай частично повреждённых данных
    for (const p of PHASES) if (!Array.isArray(s.items?.[p.key])) { s.items = seed().items; break; }
    if (!Array.isArray(s.history)) s.history = [];
    return s;
  } catch (e) {
    console.warn('Не удалось прочитать сохранение, начинаем заново.', e);
    return seed();
  }
}

let saveWarned = false;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    if (!saveWarned) { saveWarned = true; toast('Не удалось сохранить — нет места в хранилище'); }
  }
}

/** Смена суток: архивируем вчерашний день, обнуляем дневное, серии растим. */
function rollover() {
  const today = dayKeyOf(new Date());
  if (S.dayKey === today) return;

  const hadDone = PHASES.some(p => S.items[p.key].some(i => i.done)) ||
                  S.moments.some(m => m.count > 0);
  if (hadDone && !S.history.includes(S.dayKey)) S.history.push(S.dayKey);
  S.history = S.history.slice(-400);

  for (const p of PHASES) S.items[p.key].forEach(i => { i.done = false; });
  S.moments.forEach(m => { m.count = 0; });
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
  while (true) {
    const k = dayKeyOf(cur);
    if (k === dayKeyOf(today)) { if (!todayActive) break; }
    else if (!set.has(k)) break;
    n++;
    cur = addDays(cur, -1);
    if (n > 400) break;
  }
  return n;
}

/* ============================ рендер ============================ */

const $screen = document.getElementById('screen');
const $nav = document.getElementById('nav');

function headerDate() {
  const d = new Date();
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + WEEKDAYS[d.getDay()];
}

const TABS = [
  { key:'check', icon:'check', label:'Чек-лист'  },
  { key:'stop',  icon:'stop',  label:'Стоп-лист' },
  { key:'set',   icon:'set',   label:'Установки' },
  { key:'wish',  icon:'wish',  label:'Wish list' },
  { key:'diary', icon:'diary', label:'Дневник'   },
];

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

/* ---------- экран: чек-лист ---------- */
function viewCheck() {
  const all = PHASES.flatMap(p => S.items[p.key]);
  const done = all.filter(i => i.done).length, total = all.length;
  const pct = total ? done / total : 0;
  const next = all.find(i => !i.done);
  const st = streak();

  let h = '';

  h += '<div class="card ring-card">' +
    '<div class="ring">' + ringSvg(pct, 78, 31, 8) + '<div class="pct">' + Math.round(pct * 100) + '%</div></div>' +
    '<div class="grow" style="display:flex;flex-direction:column;gap:6px">' +
      '<span class="done-line">' + done + ' из ' + total + ' ' + plural(total, 'пункта', 'пунктов', 'пунктов') + '</span>' +
      '<span class="hint">' + (total === 0 ? 'Пунктов пока нет. Добавьте первый.'
        : next ? 'Дальше: ' + esc(next.text.toLowerCase()) : 'День закрыт полностью. Можно выдохнуть.') + '</span>' +
    '</div></div>';

  if (st > 0) {
    const today = new Date();
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    const hist = new Set(S.history);
    const todayActive = PHASES.some(p => S.items[p.key].some(i => i.done)) || S.moments.some(m => m.count > 0);
    const week = ['пн','вт','ср','чт','пт','сб','вс'].map((label, i) => {
      const k = dayKeyOf(addDays(monday, i));
      const on = hist.has(k) || (k === dayKeyOf(today) && todayActive);
      return '<div><i class="dot' + (on ? ' on' : '') + '"></i><span>' + label + '</span></div>';
    }).join('');
    h += '<div class="streak"><div style="display:flex;flex-direction:column;gap:3px">' +
      '<span class="streak-n">' + st + ' ' + plural(st, 'день', 'дня', 'дней') + ' подряд</span>' +
      '<span class="streak-s">Не пропускайте вечерний блок</span></div>' +
      '<div class="week">' + week + '</div></div>';
  }

  const marks = S.moments.reduce((a, m) => a + m.count, 0);
  h += '<div class="card" style="padding:16px 16px 14px;display:flex;flex-direction:column;gap:12px">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
      '<div class="grow" style="display:flex;flex-direction:column;gap:4px">' +
        '<span class="eyebrow">В моменте</span>' +
        '<span class="hint">Без привязки ко времени. Отметьте, когда сделали.</span></div>' +
      '<span style="font-size:11.5px;color:var(--faint);flex:none">' +
        (marks ? 'Сегодня ' + marks + ' ' + plural(marks, 'отметка', 'отметки', 'отметок') : 'Пока без отметок') +
      '</span></div><div class="chips">' +
    S.moments.map(m =>
      '<button class="chip' + (m.count ? ' on' : '') + '" data-act="moment" data-id="' + m.id + '">' +
        (m.count ? '' : svg('plus', { size:13, color:'#9AA1AB', width:2 })) +
        '<span>' + esc(m.label) + '</span>' +
        (m.count ? '<span class="badge">×' + m.count + '</span>' : '') + '</button>').join('') +
    '</div></div>';

  for (const p of PHASES) {
    const list = S.items[p.key];
    const d = list.filter(i => i.done).length;
    const w = list.length ? Math.round((d / list.length) * 100) : 0;
    h += '<section class="card flush">' +
      '<div class="grp-h"><div class="row">' +
        svg(p.key, { size:17, color: p.key === 'morning' ? 'var(--accent)' : 'var(--ink)', width:1.5 }) +
        '<span class="sec-t grow">' + p.name + '</span>' +
        '<span style="font-size:11.5px;color:var(--muted)">' + (list.length ? d + ' / ' + list.length : '—') + '</span>' +
      '</div><div class="bar"><i style="width:' + w + '%"></i></div></div>' +
      (list.length ? list.map(i =>
        '<div class="item' + (i.done ? ' is-done' : '') + '">' +
          '<button class="row grow" data-act="item" data-phase="' + p.key + '" data-id="' + i.id + '" style="min-height:40px">' +
            '<span class="box' + (i.done ? ' on' : '') + '">' + (i.done ? svg('tick', { size:13, color:'#fff', width:3 }) : '') + '</span>' +
            '<span class="txt">' + esc(i.text) + '</span></button>' +
          (i.time ? '<span class="time">' + esc(i.time) + '</span>' : '') +
          '<button class="del" data-act="del-item" data-phase="' + p.key + '" data-id="' + i.id + '" aria-label="Удалить пункт">' +
            svg('trash', { size:15, color:'#B43232', width:1.5 }) + '</button>' +
        '</div>').join('')
        : '<div class="empty">Пока пусто. Добавьте первый пункт.</div>') +
      '<div class="add"><input type="text" data-draft="item:' + p.key + '" placeholder="' + p.placeholder +
        '" enterkeyhint="done" autocomplete="off">' +
        '<button class="plus" data-act="add-item" data-phase="' + p.key + '" aria-label="Добавить">' +
        svg('plus', { size:17, color:'#fff', width:2.2 }) + '</button></div>' +
      '</section>';
  }
  return h;
}

/* ---------- экран: стоп-лист ---------- */
function viewStop() {
  const holding = S.stops.filter(x => !x.slipped).length;
  let h = '<div class="card pad row" style="gap:16px">' +
    '<span class="stop-ic">' + svg('stop', { size:24, color:'var(--accent)', width:1.5 }) + '</span>' +
    '<div class="grow" style="display:flex;flex-direction:column;gap:4px">' +
      '<span class="big">' + (S.stops.length ? holding + ' из ' + S.stops.length + ' держатся' : 'Пока пусто') + '</span>' +
      '<span class="hint">' + (S.stops.some(x => x.slipped)
        ? 'Один срыв не отменяет день. Отмечайте честно.'
        : 'Ни одного срыва сегодня. Так и держите.') + '</span></div></div>';

  h += '<section class="card flush">' +
    '<div class="sec-h"><span class="sec-t">Чего не делаю</span>' +
    '<span class="sec-s">Нажмите, если сорвались — серия обнулится</span></div>' +
    (S.stops.length ? S.stops.map(x =>
      '<div class="item" style="min-height:60px;padding:12px 16px">' +
        '<button class="row grow" data-act="stop" data-id="' + x.id + '" style="align-items:flex-start">' +
          '<span class="grow" style="display:flex;flex-direction:column;gap:5px;text-align:left">' +
            '<span style="font-size:14px;font-weight:600;line-height:1.35">' + esc(x.text) + '</span>' +
            '<span style="font-size:11.5px;color:var(--faint)">' +
              (x.slipped ? 'Серия сброшена сегодня' : 'Чисто ' + x.clean + ' ' + plural(x.clean, 'день', 'дня', 'дней')) +
            '</span></span>' +
          '<span class="pill ' + (x.slipped ? 'bad">Сорвался' : 'ok">Держусь') + '</span></button>' +
        '<button class="del" data-act="del-stop" data-id="' + x.id + '" aria-label="Удалить запрет">' +
          svg('trash', { size:15, color:'#B43232', width:1.5 }) + '</button></div>').join('')
      : '<div class="empty">Стоп-лист пуст. Добавьте первый пункт.</div>') +
    '<div class="add"><input type="text" data-draft="stop" placeholder="Новый запрет" enterkeyhint="done" autocomplete="off">' +
      '<button class="plus" data-act="add-stop" aria-label="Добавить">' + svg('plus', { size:17, color:'#fff', width:2.2 }) +
      '</button></div></section>';
  return h;
}

/* ---------- экран: установки ---------- */
function viewSet() {
  const act = S.intentions.find(i => i.id === S.active) || S.intentions[0];
  let h = '';
  if (act) {
    h += '<div class="intent">' +
      '<span class="eyebrow">Установка дня</span>' +
      '<span class="intent-t">' + esc(act.text) + '</span><div class="rule"></div>' +
      '<div class="row" style="justify-content:space-between">' +
        '<span class="reps">' + (act.reps
          ? 'Повторено ' + act.reps + ' ' + plural(act.reps, 'раз', 'раза', 'раз') + ' сегодня'
          : 'Сегодня ещё не повторяли') + '</span>' +
        '<button class="btn-rep" data-act="repeat">' + svg('repeat', { size:15, color:'#fff', width:2 }) +
        '<span>Повторить</span></button></div></div>';
  }
  h += '<section class="card flush">' +
    '<div class="sec-h"><span class="sec-t">Мои установки</span><span class="sec-s">Нажмите, чтобы сделать активной</span></div>' +
    (S.intentions.length ? S.intentions.map(i =>
      '<div class="item" style="min-height:56px">' +
        '<button class="row grow" data-act="pick" data-id="' + i.id + '">' +
          '<span class="led' + (i.id === S.active ? ' on' : '') + '"></span>' +
          '<span class="grow" style="font-size:14px;line-height:1.4;text-align:left">' + esc(i.text) + '</span>' +
          (i.reps ? '<span class="time">×' + i.reps + '</span>' : '') + '</button>' +
        '<button class="del" data-act="del-intent" data-id="' + i.id + '" aria-label="Удалить установку">' +
          svg('trash', { size:15, color:'#B43232', width:1.5 }) + '</button></div>').join('')
      : '<div class="empty">Установок пока нет. Запишите первую.</div>') +
    '<div class="add"><input type="text" data-draft="set" placeholder="Новая установка" enterkeyhint="done" autocomplete="off">' +
      '<button class="plus" data-act="add-intent" aria-label="Добавить">' + svg('plus', { size:17, color:'#fff', width:2.2 }) +
      '</button></div></section>';
  return h;
}

/* ---------- экран: желания ---------- */
function viewWish() {
  const doneN = S.wishes.filter(w => w.done).length;
  const pct = S.wishes.length ? doneN / S.wishes.length : 0;

  const upcoming = S.wishes.filter(w => !w.done && w.due)
    .map(w => ({ w, d: daysLeft(w.due) })).filter(x => x.d >= 0)
    .sort((a, b) => a.d - b.d)[0];
  const nearest = upcoming
    ? 'Ближайшее — ' + upcoming.w.text.toLowerCase() + ', ' + upcoming.d + ' ' + plural(upcoming.d, 'день', 'дня', 'дней')
    : 'Ближайших дат нет';

  let h = '<div class="card pad row" style="justify-content:space-between">' +
    '<div class="grow" style="display:flex;flex-direction:column;gap:3px">' +
      '<span class="big">' + doneN + ' из ' + S.wishes.length + '</span>' +
      '<span class="hint">исполнено из списка желаний</span>' +
      '<span style="font-size:12px;line-height:1.4;color:var(--ink-2)">' + esc(nearest) + '</span></div>' +
    ringSvg(pct, 46, 18, 6) + '</div>';

  h += S.wishes.length ? '<div style="display:flex;flex-direction:column;gap:10px">' + S.wishes.map(w => {
    const left = w.due ? daysLeft(w.due) : null;
    const abs = left === null ? 0 : Math.abs(left);
    let bottomLeft;
    if (w.done) {
      bottomLeft = '<span class="pill ok">Исполнено</span>';
    } else if (w.due) {
      bottomLeft = '<span style="display:flex;align-items:baseline;gap:7px">' +
        '<span class="days' + (left < 0 ? ' over' : '') + '">' + abs + '</span>' +
        '<span style="font-size:12px;color:var(--muted)">' +
          plural(abs, 'день', 'дня', 'дней') + (left < 0 ? ' просрочено' : ' осталось') + '</span></span>';
    } else {
      bottomLeft = '<span style="font-size:12px;color:var(--faint)">Дата не указана</span>';
    }
    return '<article class="card flush' + (w.done ? ' is-done' : '') + '">' +
      '<div class="wish-top">' +
        '<span class="mono" aria-hidden="true">' + esc((w.text.trim()[0] || '•').toUpperCase()) + '</span>' +
        '<div class="grow" style="display:flex;flex-direction:column;gap:8px">' +
          '<span class="wish-t">' + esc(w.text) + '</span>' +
          '<div class="row" style="flex-wrap:wrap;gap:8px">' +
            '<span class="tag">' + esc(w.cat) + '</span>' +
            (w.note ? '<span style="font-size:12px;color:var(--muted)">' + esc(w.note) + '</span>' : '') +
          '</div></div>' +
        '<button data-act="wish" data-id="' + w.id + '" style="flex:none;padding:4px" aria-label="Отметить исполненным">' +
          '<span class="circ' + (w.done ? ' on' : '') + '">' + (w.done ? svg('tick', { size:13, color:'#fff', width:3 }) : '') +
          '</span></button></div>' +
      '<div class="wish-b">' + bottomLeft +
        '<span class="row" style="gap:7px;flex:none">' +
          '<input class="date-in" type="date" value="' + esc(w.due || '') + '" data-act="wish-due" data-id="' + w.id +
            '" aria-label="Дата желания">' +
          '<button class="del" data-act="del-wish" data-id="' + w.id + '" aria-label="Удалить желание">' +
            svg('trash', { size:15, color:'#B43232', width:1.5 }) + '</button></span>' +
      '</div></article>';
  }).join('') + '</div>'
  : '<div class="dash">Список желаний пуст. Запишите первое.</div>';

  h += '<div class="row" style="gap:10px">' +
    '<input type="text" data-draft="wish" placeholder="Новое желание" enterkeyhint="done" autocomplete="off" ' +
      'style="flex:1;min-width:0;height:46px;padding:0 14px;border:1px solid var(--line-input);border-radius:10px;background:#fff;font-size:16px">' +
    '<button class="plus" data-act="add-wish" aria-label="Добавить" ' +
      'style="width:46px;height:46px;border-radius:10px;background:var(--accent);display:grid;place-items:center;flex:none">' +
      svg('plus', { size:18, color:'#fff', width:2.2 }) + '</button></div>';
  return h;
}

/* ---------- экран: дневник ---------- */
function viewDiary() {
  let h = '<div class="card pad" style="display:flex;flex-direction:column;gap:14px">' +
    '<span class="eyebrow">Как прошёл день</span><div class="moods">' +
    MOODS.map((label, i) =>
      '<button class="mood' + (S.mood === i ? ' on' : '') + '" data-act="mood" data-i="' + i + '">' +
      '<i></i><span>' + label + '</span></button>').join('') +
    '</div></div>';

  h += '<div class="card pad" style="display:flex;flex-direction:column;gap:16px">' +
    '<div class="fld"><label for="f-good">Что получилось</label>' +
      '<textarea id="f-good" data-draft="good" rows="2" placeholder="Три строки хватит">' + esc(S.fields.good) + '</textarea></div>' +
    '<div class="fld"><label for="f-hard">Что забрало силы</label>' +
      '<textarea id="f-hard" data-draft="hard" rows="2" placeholder="Без оценок, просто факт">' + esc(S.fields.hard) + '</textarea></div>' +
    '<div class="fld"><label for="f-thanks">Благодарность</label>' +
      '<textarea id="f-thanks" data-draft="thanks" rows="2" placeholder="За что сегодня">' + esc(S.fields.thanks) + '</textarea></div>' +
    '<button class="save" data-act="save-entry">Сохранить запись</button></div>';

  h += '<section class="card flush">' +
    '<div class="sec-h"><span class="sec-t">Прошлые записи</span></div>' +
    (S.entries.length ? S.entries.map(e =>
      '<div class="entry"><div class="row" style="gap:8px">' +
        '<span class="entry-d">' + esc(e.date) + '</span><span class="tag">' + esc(e.mood) + '</span>' +
        '<span class="grow"></span>' +
        '<button class="del" data-act="del-entry" data-id="' + e.id + '" aria-label="Удалить запись">' +
          svg('trash', { size:15, color:'#B43232', width:1.5 }) + '</button></div>' +
        '<span class="entry-t">' + esc(e.text) + '</span></div>').join('')
      : '<div class="empty">Записей пока нет.</div>') + '</section>';
  return h;
}

const VIEWS = { check:viewCheck, stop:viewStop, set:viewSet, wish:viewWish, diary:viewDiary };

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

/* ============================ действия ============================ */

const drafts = { 'item:morning':'', 'item:day':'', 'item:evening':'', stop:'', set:'', wish:'' };

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function commit(keepScroll = true) { save(); render(keepScroll); }

const ACTIONS = {
  tab(el) { S.tab = el.dataset.tab; save(); render(false); },

  item(el) {
    const list = S.items[el.dataset.phase];
    const i = list.find(x => x.id === el.dataset.id);
    if (i) { i.done = !i.done; commit(); }
  },
  'del-item'(el) {
    S.items[el.dataset.phase] = S.items[el.dataset.phase].filter(x => x.id !== el.dataset.id);
    commit();
  },
  'add-item'(el) {
    const phase = el.dataset.phase;
    const text = (drafts['item:' + phase] || '').trim();
    if (!text) return;
    S.items[phase].push({ id: uid(phase), text, time:'', done:false });
    drafts['item:' + phase] = '';
    commit();
  },

  moment(el) {
    const m = S.moments.find(x => x.id === el.dataset.id);
    if (m) { m.count += 1; commit(); }
  },

  stop(el) {
    const x = S.stops.find(y => y.id === el.dataset.id);
    if (x) { x.slipped = !x.slipped; if (x.slipped) x.clean = 0; commit(); }
  },
  'del-stop'(el) { S.stops = S.stops.filter(x => x.id !== el.dataset.id); commit(); },
  'add-stop'() {
    const text = drafts.stop.trim(); if (!text) return;
    S.stops.push({ id: uid('s'), text, clean:0, slipped:false });
    drafts.stop = ''; commit();
  },

  pick(el) { S.active = el.dataset.id; commit(); },
  repeat() {
    const i = S.intentions.find(x => x.id === S.active);
    if (i) { i.reps += 1; commit(); }
  },
  'del-intent'(el) {
    S.intentions = S.intentions.filter(x => x.id !== el.dataset.id);
    if (S.active === el.dataset.id) S.active = S.intentions[0]?.id || null;
    commit();
  },
  'add-intent'() {
    const text = drafts.set.trim(); if (!text) return;
    const id = uid('i');
    S.intentions.unshift({ id, text, reps:0 });
    S.active = id; drafts.set = ''; commit();
  },

  wish(el) {
    const w = S.wishes.find(x => x.id === el.dataset.id);
    if (!w) return;
    w.done = !w.done;
    w.doneAt = w.done ? dayKeyOf(new Date()) : undefined;
    commit();
  },
  'del-wish'(el) { S.wishes = S.wishes.filter(x => x.id !== el.dataset.id); commit(); },
  'add-wish'() {
    const text = drafts.wish.trim(); if (!text) return;
    S.wishes.unshift({ id: uid('w'), text, cat:'Без раздела', note:'', due:'', done:false });
    drafts.wish = ''; commit();
  },

  mood(el) { S.mood = Number(el.dataset.i); commit(); },
  'save-entry'() {
    const f = S.fields;
    const text = [f.good, f.hard, f.thanks].map(t => (t || '').trim()).filter(Boolean).join(' · ');
    if (!text) { toast('Заполните хотя бы одно поле'); return; }
    const d = new Date();
    S.entries.unshift({ id: uid('x'), date: d.getDate() + ' ' + MONTHS[d.getMonth()], mood: MOODS[S.mood], text });
    S.fields = { good:'', hard:'', thanks:'' };
    commit(false);
    toast('Запись сохранена');
  },
  'del-entry'(el) { S.entries = S.entries.filter(x => x.id !== el.dataset.id); commit(); },
};

/* делегирование: один слушатель на всё приложение */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});

/* черновики полей — пишем в память без перерисовки, чтобы не терять фокус */
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.draft) {
    if (el.dataset.draft in drafts) drafts[el.dataset.draft] = el.value;
    else { S.fields[el.dataset.draft] = el.value; save(); }
  }
});

/* дата у желания */
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.act === 'wish-due') {
    const w = S.wishes.find(x => x.id === el.dataset.id);
    if (w) { w.due = el.value; commit(); }
  }
});

/* Enter в поле добавления */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const el = e.target;
  const d = el.dataset?.draft;
  if (!d || el.tagName === 'TEXTAREA') return;
  e.preventDefault();
  if (d.startsWith('item:')) ACTIONS['add-item']({ dataset: { phase: d.slice(5) } });
  else if (d === 'stop') ACTIONS['add-stop']();
  else if (d === 'set') ACTIONS['add-intent']();
  else if (d === 'wish') ACTIONS['add-wish']();
});

/* вернулись в приложение — проверяем, не наступил ли новый день */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const before = S.dayKey;
    rollover();
    if (before !== S.dayKey) render(false);
  }
});

/* ============================ старт ============================ */

rollover();
render(false);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* офлайн-режим просто не включится */ });
  });
}
