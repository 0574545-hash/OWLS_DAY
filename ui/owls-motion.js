/* ============================================================
   OWLS Motion — поведение дизайн-системы OWLS.
   Без сборки и зависимостей: <script src="owls-motion.js"></script>
   Всё складывается в глобальный объект OWLS.
   Порядок в приложении: рисуем разметку → OWLS.tabs(...) один раз →
   после каждой перерисовки OWLS.afterRender(...).
   ============================================================ */
(function (global) {
  'use strict';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------------------------------------------------------- утилиты */

  /** Проиграть анимацию один раз и снять класс, чтобы её можно было повторить. */
  function animateOnce(el, cls) {
    if (!el || reduced) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  /** Короткое сообщение внизу экрана. Нужен элемент с классом toast. */
  let toastEl = null, toastTimer = null;
  function toast(msg, ms) {
    toastEl = toastEl || document.querySelector('.toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 1900);
  }

  /** Вибрация: Android отвечает, iPhone из браузера — нет. */
  function buzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* не поддерживается */ }
  }

  /* ---------------------------------------------------------- 1. каскад */

  const RISE_STEP = 30, RISE_MAX = 14;   // шаг 30 мс, дальше 14-го элемента не ждём

  /**
   * Раздать строкам задержку, чтобы список вышел по одной строке.
   * Вызывать только при смене экрана и на старте: на каждое касание — не нужно.
   */
  function cascade(root, selector) {
    if (!root || reduced) return;
    const sel = selector || '.card, .grp-h, .sec-h, .item, .chip, .entry, .slab, .dash, .mini';
    let n = 0;
    for (const el of root.querySelectorAll(sel)) {
      el.style.animationDelay = Math.min(n++, RISE_MAX) * RISE_STEP + 'ms';
      el.classList.add('rise');
      el.addEventListener('animationend', () => {
        el.classList.remove('rise'); el.style.animationDelay = '';
      }, { once: true });
    }
  }

  /* ---------------------------------------------------------- 2. кольцо */

  const RING_MEM = {};   // последнее показанное значение по ключу экрана

  /**
   * Разметка кольца. Рисуется со старого значения, afterRender доводит до нового.
   * pct — доля от 0 до 1; key — ключ экрана, чтобы кольцо помнило прошлое значение.
   */
  function ringSvg(pct, size, r, w, key) {
    size = size || 78; r = r || 31; w = w || 8;
    const c = 2 * Math.PI * r;
    const prev = key && RING_MEM[key] !== undefined ? RING_MEM[key] : pct;
    if (key) RING_MEM[key] = pct;
    const off = v => (c * (1 - clamp(v, 0, 1))).toFixed(1);
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="display:block">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#EFECE3" stroke-width="' + w + '"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="' + w +
      '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off(prev) +
      '" data-to="' + off(pct) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }

  const NUM_MEM = {};

  /**
   * Готовая шапка экрана: кольцо с процентом, счёт и подсказка «что дальше».
   * ringCard('check', 3, 11, '3 из 11 пунктов', 'Дальше: прогулка')
   */
  function ringCard(key, done, total, countText, hint) {
    const pct = total ? done / total : 0;
    const to = Math.round(pct * 100);
    const shown = NUM_MEM[key] === undefined ? 0 : NUM_MEM[key];
    const wide = to === 100 || shown === 100 ? ' w3' : '';
    return '<div class="card ring-card">' +
      '<div class="ring">' + ringSvg(pct, 78, 31, 8, key) +
        '<div class="pct' + wide + '" data-from="' + shown + '" data-to="' + to + '">' + shown + '%</div></div>' +
      '<div class="grow" style="display:flex;flex-direction:column;gap:6px">' +
        '<span class="done-line">' + countText + '</span>' +
        '<span class="hint">' + hint + '</span>' +
      '</div></div>';
  }

  /**
   * Довести кольцо и докрутить процент. Вызывать после каждой перерисовки экрана.
   * key — тот же ключ, что у ringCard.
   */
  let numRaf = null;
  function afterRender(root, key) {
    root = root || document;
    const circle = root.querySelector('.ring circle[data-to]');
    if (circle) requestAnimationFrame(() => { circle.style.strokeDashoffset = circle.dataset.to; });

    const el = root.querySelector('.pct[data-to]');
    if (!el) return;
    const from = Number(el.dataset.from) || 0, to = Number(el.dataset.to) || 0;
    if (key) NUM_MEM[key] = to;
    const put = v => { el.textContent = v + '%'; el.classList.toggle('w3', v >= 100); };
    cancelAnimationFrame(numRaf);
    /* в фоновой вкладке кадры не идут — показываем итог сразу */
    if (reduced || from === to || document.visibilityState !== 'visible') { put(to); return; }
    const t0 = performance.now(), dur = 500;
    const ease = k => 1 - Math.pow(1 - k, 3);
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      put(Math.round(from + (to - from) * ease(k)));
      if (k < 1) numRaf = requestAnimationFrame(step);
    };
    numRaf = requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------- 3. вкладки и свайп */

  const SW_LOCK = 10,      // после какого сдвига решаем: это свайп или прокрутка
        SW_PART = 0.25,    // доля ширины для перехода
        SW_FAST = 0.45,    // скорость флика, px/мс
        SW_MIN = 44;       // минимальный путь для флика

  /**
   * Связать нижнее меню, экран и свайп.
   * tabs({ screen, nav, keys, current: () => key, go: (key, dir) => { ... } })
   * `go` обязан сам перерисовать экран; анимацию въезда и каскад модуль сделает сам.
   */
  function tabs(o) {
    const screen = o.screen, nav = o.nav, keys = o.keys;
    const idx = k => keys.indexOf(k);
    let moved = false;

    /* ---- подчёркивание ---- */
    const ul = nav.querySelector('.nav-ul');
    const slot = k => nav.querySelector('[data-tab="' + k + '"] .ul');
    function ulAt(fromKey, toKey, part) {
      if (!ul) return;
      const a = slot(fromKey), b = slot(toKey || fromKey);
      if (!a || !b) return;
      ul.style.transform = 'translate(' + (a.offsetLeft + (b.offsetLeft - a.offsetLeft) * part) + 'px,' + a.offsetTop + 'px)';
    }
    function sync() {
      const cur = o.current();
      for (const b of nav.querySelectorAll('[data-tab]')) {
        const on = b.dataset.tab === cur;
        b.classList.toggle('on', on);
        b.setAttribute('aria-current', on ? 'page' : 'false');
        const svg = b.querySelector('svg');
        if (svg) svg.setAttribute('stroke', on ? 'var(--accent)' : '#9AA1AB');
      }
      ulAt(cur, cur, 0);
      if (ul) ul.classList.add('ready');
    }

    /* ---- переход ---- */
    function enter(dir) {
      sync();
      if (reduced) return;
      screen.classList.remove('go-l', 'go-r');
      animateOnce(screen, 'go-' + dir);
      animateOnce(document.querySelector('.hd-t'), 'go');
      cascade(screen);
    }
    function goTo(key) {
      const cur = o.current();
      if (key === cur) { screen.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); return; }
      const dir = idx(key) > idx(cur) ? 'l' : 'r';
      o.go(key, dir);
      enter(dir);
    }

    nav.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) { e.preventDefault(); goTo(b.dataset.tab); }
    });

    /* ---- свайп ---- */
    let id = null, x0 = 0, y0 = 0, t0 = 0, dir = 0, on = false, to = null;
    const neighbour = dx => keys[idx(o.current()) + (dx < 0 ? 1 : -1)] || null;
    function reset() {
      screen.classList.remove('swiping'); screen.style.transform = '';
      id = null; on = false; to = null; dir = 0;
    }
    function back() {
      if (!on) { id = null; return; }
      screen.classList.remove('swiping');
      screen.classList.add('sw-back');
      screen.style.transform = '';
      ulAt(o.current(), o.current(), 0);
      const done = () => { screen.classList.remove('sw-back'); reset(); };
      screen.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 260);
      on = false;
      dropFlag();
    }
    function dropFlag() { setTimeout(() => { moved = false; }, 0); }

    screen.addEventListener('pointerdown', e => {
      if (id !== null || e.isPrimary === false) return;
      if (e.target.closest('textarea, input, select, .del')) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; t0 = performance.now();
      dir = 0; on = false; moved = false; to = null;
    });

    screen.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!dir) {
        if (Math.abs(dx) < SW_LOCK && Math.abs(dy) < SW_LOCK) return;
        dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? 1 : -1;    // -1 — обычная вертикальная прокрутка
        if (dir === 1) {
          to = neighbour(dx);
          if (!to) { dir = -1; return; }
          on = true; moved = true;
          screen.classList.add('swiping');
        }
        return;
      }
      if (!on) return;
      e.preventDefault();
      const w = screen.clientWidth || 1;
      to = neighbour(dx);                                    // палец мог сменить направление
      screen.style.transform = 'translateX(' + (to ? dx : dx * 0.25) + 'px)';
      if (to) ulAt(o.current(), to, Math.min(1, Math.abs(dx) / w));
    }, { passive: false });

    function end(e) {
      if (e.pointerId !== id) return;
      if (!on) { id = null; return; }
      const dx = e.clientX - x0, w = screen.clientWidth || 1;
      const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
      const need = Math.max(SW_MIN, w * SW_PART);            // на узком экране порог не вырождается
      const go = to && (Math.abs(dx) > need || (v > SW_FAST && Math.abs(dx) > SW_MIN));
      dropFlag();
      if (!go) { back(); return; }

      const side = dx < 0 ? 'l' : 'r', next = to;
      screen.classList.remove('swiping');
      screen.classList.add('sw-out');
      screen.style.transform = 'translateX(' + (dx < 0 ? -w : w) + 'px)';
      const finish = () => {
        screen.classList.remove('sw-out'); screen.style.transform = '';
        reset(); o.go(next, side); enter(side);
      };
      screen.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 220);
    }
    screen.addEventListener('pointerup', end);
    screen.addEventListener('pointercancel', e => { if (e.pointerId === id) back(); });
    /* палец отпускается над кнопкой — гасим клик, прилетевший сразу после свайпа */
    screen.addEventListener('click', e => {
      if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); }
    }, true);

    addEventListener('resize', () => ulAt(o.current(), o.current(), 0));
    sync();
    requestAnimationFrame(() => { if (ul) ul.classList.add('ready'); });
    return { go: goTo, sync: sync, enter: enter };
  }

  /* ---------------------------------------------------------- 4. удержание */

  /**
   * Удаление только по долгому нажатию: случайное касание ничего не сносит.
   * hold({ selector: '.del', ms: 2000, onFire, onShort })
   */
  function hold(o) {
    const sel = o.selector || '.del', ms = o.ms || 2000, move = o.move || 10;
    let timer = null, el = null, fired = false, x = 0, y = 0;
    const cancel = () => {
      clearTimeout(timer); timer = null;
      if (el) { el.classList.remove('holding'); el = null; }
    };
    document.addEventListener('pointerdown', e => {
      const b = e.target.closest(sel);
      if (!b) return;
      cancel(); fired = false; el = b; x = e.clientX; y = e.clientY;
      b.classList.add('holding');
      timer = setTimeout(() => {
        timer = null; fired = true; b.classList.remove('holding');
        buzz([30]);
        if (o.onFire) o.onFire(b);
      }, ms);
    });
    document.addEventListener('pointermove', e => {
      if (timer && Math.hypot(e.clientX - x, e.clientY - y) > move) cancel();
    });
    document.addEventListener('pointerup', cancel);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('contextmenu', e => { if (e.target.closest(sel)) e.preventDefault(); });
    document.addEventListener('click', e => {
      const b = e.target.closest(sel);
      if (!b) return;
      e.preventDefault();
      if (fired) fired = false;
      else if (o.onShort) o.onShort(b);
    });
  }

  /* ---------------------------------------------------------- 5. всплеск */

  const FX_COLORS = ['#F26336', '#F26336', '#0B1E35', '#FFD9CC', '#E9E5DC', '#F9A98A'];
  let canvas = null, ctx = null, parts = [], raf = null, dpr = 1;
  function fit() {
    if (!canvas) return;
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  }
  function ensureCanvas() {
    if (canvas) return canvas;
    canvas = document.querySelector('canvas.owls-fx') || document.createElement('canvas');
    if (!canvas.isConnected) {
      canvas.className = 'owls-fx';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:70';
      document.body.appendChild(canvas);
    }
    ctx = canvas.getContext('2d');
    fit(); addEventListener('resize', fit);
    return canvas;
  }
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.life -= 1; p.x += p.vx; p.y += p.vy; p.vy += 0.42; p.vx *= 0.99; p.a = Math.max(0, p.life / p.born);
      ctx.globalAlpha = p.a; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, p.r * dpr, 0, 6.284); ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(tick) : null;
  }
  /** Всплеск частиц из центра элемента. Вызывать до перерисовки — координаты берём с живого узла. */
  function splash(el, n) {
    buzz([18, 30, 42]);
    if (reduced || !el) return;
    ensureCanvas();
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < (n || 14); i++) {
      const a = Math.random() * 6.284, sp = 1.6 + Math.random() * 3.4, life = 26 + Math.random() * 18;
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.2,
        r: 1.6 + Math.random() * 2.4, c: FX_COLORS[(Math.random() * FX_COLORS.length) | 0], life, born: life, a: 1 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------- иконки */

  /* Единый набор: обводка 1.6, скруглённые концы, сетка 24×24. */
  const ICON = {
    check:'<path d="M9 5h11M9 12h11M9 19h11"/><path d="M3 5.5 4.4 7 6.8 4"/><path d="M3 12.5 4.4 14 6.8 11"/><path d="M3 19.5 4.4 21 6.8 18"/>',
    stop:'<circle cx="12" cy="12" r="8.5"/><path d="M6 18 18 6"/>',
    diary:'<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    wish:'<path d="m12 3.5 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.9l6.1-.8Z"/>',
    pill:'<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9.2 9.2 5.6 5.6"/>',
    tick:'<path d="M4 12.5 9.5 18 20 6.5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    trash:'<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>',
    morning:'<path d="M12 5V3M5.5 8.5 4 7M18.5 8.5 20 7M3 17h18M6 17a6 6 0 0 1 12 0"/>',
    day:'<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
    evening:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    back:'<path d="m15 5-7 7 7 7"/>',
  };
  function icon(name, o) {
    o = o || {};
    const s = o.size || 20, c = o.color || 'currentColor', w = o.width || 1.6;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="' + c +
      '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || '') + '</svg>';
  }

  global.OWLS = {
    reduced, animateOnce, toast, buzz,
    cascade, ringSvg, ringCard, afterRender,
    tabs, hold, splash, icon, ICON,
  };
})(window);
