/*
 * Comunica — lógica de la aplicación.
 * Sin dependencias. Todo se guarda en localStorage del dispositivo.
 *
 * Principio de seguridad: ningún mensaje se registra como "confirmado"
 * sin que el familiar marque explícitamente que la paciente asintió.
 */
'use strict';

(function () {
  const APP_VERSION = '1.0.0';
  const HISTORY_MAX = 300;

  const KEYS = {
    settings: 'comunica.settings.v1',
    custom: 'comunica.custom.v1',
    history: 'comunica.history.v1',
    buffer: 'comunica.buffer.v1'
  };

  const DEFAULT_SETTINGS = { scale: 1, theme: 'dark', voice: true, wake: true };

  /* ---------------- Persistencia ---------------- */
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      toast('No se pudo guardar en el dispositivo');
    }
  }

  /* ---------------- Estado ---------------- */
  const S = {
    settings: Object.assign({}, DEFAULT_SETTINGS, load(KEYS.settings, {})),
    custom: load(KEYS.custom, {}),        // { idCategoria: [texto, ...] }
    history: load(KEYS.history, []),      // [{ ts, text, kind }]
    buffer: load(KEYS.buffer, ''),        // frase en construcción
    route: { v: 'home' },
    stack: [],
    scanning: false,
    scanIdx: 0,
    scanUnclear: false
  };
  if (!Array.isArray(S.history)) S.history = [];
  if (typeof S.buffer !== 'string') S.buffer = '';
  if (!S.custom || typeof S.custom !== 'object') S.custom = {};

  const $header = document.getElementById('header');
  const $main = document.getElementById('main');
  const $quick = document.getElementById('quickbar');
  const $toast = document.getElementById('toast');

  /* ---------------- Utilidades DOM ---------------- */
  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'onclick') el.addEventListener('click', v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(c => append(el, c)); return; }
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }

  function btn(label, onclick, cls, extra) {
    return h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), onclick }, extra || {}), label);
  }

  let toastTimer = null;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2500);
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
    return sameDay ? 'Hoy ' + time : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + time;
  }

  /* ---------------- Voz (síntesis local del dispositivo) ---------------- */
  const ttsSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let esVoice = null;

  function pickVoice() {
    if (!ttsSupported) return;
    const voices = window.speechSynthesis.getVoices() || [];
    const prefs = ['es-PE', 'es-419', 'es-US', 'es-MX', 'es-ES'];
    esVoice = null;
    for (const p of prefs) {
      esVoice = voices.find(v => v.lang && v.lang.replace('_', '-').toLowerCase() === p.toLowerCase());
      if (esVoice) break;
    }
    if (!esVoice) esVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('es')) || null;
  }

  if (ttsSupported) {
    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      pickVoice();
      if (S.route.v === 'settings') render();
    });
  }

  function speak(text, force) {
    if (!ttsSupported || (!S.settings.voice && !force)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = esVoice ? esVoice.lang : 'es-ES';
      if (esVoice) u.voice = esVoice;
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* La voz es opcional: si falla, el mensaje sigue visible en pantalla. */
    }
  }

  /* ---------------- Pantalla encendida ---------------- */
  let wakeLock = null;
  async function updateWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      if (S.settings.wake && document.visibilityState === 'visible') {
        if (!wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
      } else if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) {
      wakeLock = null;
    }
  }
  document.addEventListener('visibilitychange', updateWakeLock);
  // Algunos navegadores solo conceden el bloqueo tras una interacción.
  document.addEventListener('click', () => { if (S.settings.wake && !wakeLock) updateWakeLock(); }, { passive: true });

  /* ---------------- Historial y frase ---------------- */
  function logHistory(text, kind) {
    S.history.unshift({ ts: Date.now(), text, kind });
    if (S.history.length > HISTORY_MAX) S.history.length = HISTORY_MAX;
    save(KEYS.history, S.history);
  }

  function setBuffer(value) {
    S.buffer = value;
    save(KEYS.buffer, S.buffer);
  }

  function appendWord(word) {
    const b = S.buffer;
    const sep = b.length === 0 || b.endsWith(' ') ? '' : ' ';
    setBuffer(b + sep + word + ' ');
  }

  function appendChar(ch) {
    setBuffer(S.buffer + ch);
  }

  function addSpace() {
    if (S.buffer.length && !S.buffer.endsWith(' ')) setBuffer(S.buffer + ' ');
  }

  function deleteChar() {
    if (!S.buffer.length) { toast('La frase está vacía'); return; }
    setBuffer(S.buffer.slice(0, -1));
  }

  function deleteWord() {
    const t = S.buffer.trimEnd();
    if (!t.length) { toast('La frase está vacía'); return; }
    const i = t.lastIndexOf(' ');
    setBuffer(i === -1 ? '' : t.slice(0, i + 1));
  }

  function confirmBuffer() {
    const text = S.buffer.trim();
    if (!text) { toast('La frase está vacía'); render(); return; }
    go({ v: 'confirm', text, urgent: false, source: 'builder' });
  }

  /* ---------------- Navegación ---------------- */
  function go(route) {
    S.stack.push({ route: S.route, scanIdx: S.scanIdx });
    S.route = route;
    S.scanIdx = 0;
    S.scanUnclear = false;
    render();
  }

  function back() {
    const prev = S.stack.pop();
    S.route = prev ? prev.route : { v: 'home' };
    S.scanIdx = prev ? prev.scanIdx : 0;
    S.scanUnclear = false;
    render();
  }

  function goHome() {
    S.stack = [];
    S.route = { v: 'home' };
    S.scanIdx = 0;
    S.scanUnclear = false;
    render();
  }

  function startScan() {
    S.scanning = true;
    S.scanIdx = 0;
    S.scanUnclear = false;
    render();
  }

  function stopScan() {
    S.scanning = false;
    S.scanUnclear = false;
    render();
  }

  /* Botón "atrás" de Android: navega dentro de la app en lugar de cerrarla. */
  history.replaceState({ comunica: 'base' }, '');
  history.pushState({ comunica: 'guard' }, '');
  window.addEventListener('popstate', () => {
    history.pushState({ comunica: 'guard' }, '');
    if (S.route.v !== 'home') back();
    else if (S.scanning) stopScan();
  });

  /* ---------------- Datos de categorías ---------------- */
  function getCat(id) {
    return VOCAB.find(c => c.id === id);
  }

  function catItems(id, path) {
    const cat = getCat(id);
    if (!cat) return { title: '', items: [] };
    const custom = (S.custom[id] || []).map(t => ({ t, custom: true }));
    let items = custom.concat(cat.items);
    let title = cat.title;
    for (const idx of path) {
      const parent = items[idx];
      if (!parent || !parent.children) break;
      title = parent.t;
      items = parent.children;
    }
    return { title, items };
  }

  /* ---------------- Modelo de cada vista ---------------- */
  function viewModel() {
    const r = S.route;

    if (r.v === 'home') {
      const options = VOCAB.map(c => ({
        label: c.title,
        icon: c.icon,
        cls: 'cat cat-' + c.id,
        run: () => go({ v: 'cat', id: c.id, path: [] })
      }));
      options.push({ label: 'Abecedario', icon: '🔤', cls: 'cat cat-abc', run: () => go({ v: 'alpha', group: null }) });
      options.push({ label: 'Construir frase', icon: '✏️', cls: 'cat cat-frase wide', run: () => go({ v: 'builder' }) });
      return { title: 'Comunica', scannable: true, gridClass: 'home', options };
    }

    if (r.v === 'cat') {
      const data = catItems(r.id, r.path);
      const options = data.items.map((item, i) => {
        if (item.children) {
          return { label: item.t, cls: 'sub', run: () => go({ v: 'cat', id: r.id, path: r.path.concat(i) }) };
        }
        return {
          label: item.t,
          cls: (item.u ? 'urgent ' : '') + (item.custom ? 'custom' : ''),
          urgent: !!item.u,
          run: () => go({ v: 'confirm', text: item.t, urgent: !!item.u, source: 'item' })
        };
      });
      return { title: data.title, scannable: true, options, showStrip: true };
    }

    if (r.v === 'alpha') {
      const toGroups = () => {
        S.stack.pop();
        S.route = { v: 'alpha', group: null };
        S.scanIdx = 0;
        render();
      };
      const actions = [
        { label: '␣ Espacio', cls: 'action', run: () => { addSpace(); S.scanIdx = 0; render(); } },
        { label: '⌫ Borrar letra', cls: 'action', run: () => { deleteChar(); S.scanIdx = 0; render(); } },
        { label: '✓ Frase lista', cls: 'action wide', run: confirmBuffer }
      ];
      if (r.group !== null && r.group !== undefined) {
        const letters = LETTER_GROUPS[r.group].map(L => ({
          label: L, cls: 'letter', run: () => { appendChar(L); toGroups(); }
        }));
        letters.push({ label: '◀ Volver a los grupos', cls: 'action wide', run: toGroups });
        return { title: 'Letras ' + LETTER_GROUPS[r.group][0] + '–' + LETTER_GROUPS[r.group].slice(-1)[0], scannable: true, options: letters, gridClass: 'letters', phraseBox: true };
      }
      if (S.scanning) {
        const groups = LETTER_GROUPS.map((g, i) => ({
          label: g.join(' '), cls: '', run: () => go({ v: 'alpha', group: i })
        }));
        return { title: 'Abecedario', scannable: true, options: groups.concat(actions), phraseBox: true };
      }
      const all = [];
      LETTER_GROUPS.forEach(g => g.forEach(L => all.push({
        label: L, cls: 'letter', run: () => { appendChar(L); render(); }
      })));
      return { title: 'Abecedario', scannable: true, options: all.concat(actions), gridClass: 'letters', phraseBox: true };
    }

    if (r.v === 'builder') {
      const options = [
        { label: '✓ Frase lista', cls: 'action', run: confirmBuffer },
        { label: '⌫ Borrar última palabra', cls: 'action', run: () => { deleteWord(); S.scanIdx = 0; render(); } },
        { label: '🔤 Abecedario', cls: 'action', run: () => go({ v: 'alpha', group: null }) },
        {
          label: '🗑 Vaciar frase', cls: 'action', noScan: true, run: () => {
            if (!S.buffer.trim()) { toast('La frase está vacía'); return; }
            if (window.confirm('¿Vaciar toda la frase?')) { setBuffer(''); render(); }
          }
        }
      ].concat(WORDS.map(w => ({ label: w, cls: '', run: () => { appendWord(w); S.scanIdx = 0; render(); } })));
      return { title: 'Construir frase', scannable: true, options, phraseBox: true };
    }

    const titles = { confirm: 'Confirmar', display: 'Mensaje', history: 'Historial', settings: 'Ajustes' };
    return { title: titles[r.v] || 'Comunica', scannable: false, options: [] };
  }

  /* ---------------- Render ---------------- */
  function applySettings() {
    document.documentElement.style.setProperty('--scale', String(S.settings.scale));
    document.documentElement.setAttribute('data-theme', S.settings.theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', S.settings.theme === 'light' ? '#ffffff' : '#000000');
  }

  function render() {
    applySettings();
    const vm = viewModel();
    const r = S.route;
    const scanningHere = S.scanning && vm.scannable;

    renderHeader(vm.title);
    $main.replaceChildren();

    if (r.v === 'confirm') renderConfirm();
    else if (r.v === 'display') renderDisplay();
    else if (r.v === 'history') renderHistory();
    else if (r.v === 'settings') renderSettings();
    else if (scanningHere) renderScan(vm);
    else renderList(vm);

    const showQuick = vm.scannable && !scanningHere;
    $quick.hidden = !showQuick;
    if (showQuick) renderQuick();

    $main.scrollTop = 0;
    if (r.v === 'display') fitText();
  }

  function renderHeader(title) {
    $header.replaceChildren();
    const isHome = S.route.v === 'home';
    $header.append(
      isHome ? h('span', { class: 'hspacer' }) : h('button', { type: 'button', class: 'hbtn', onclick: back, 'aria-label': 'Atrás' }, '‹ Atrás'),
      h('h1', { text: title }),
      isHome ? h('span', { class: 'hspacer' }) : h('button', { type: 'button', class: 'hbtn', onclick: goHome, 'aria-label': 'Ir al inicio' }, '⌂ Inicio')
    );
  }

  function renderQuick() {
    $quick.replaceChildren();
    Object.keys(QUICK).forEach(key => {
      $quick.append(h('button', { type: 'button', class: 'q-' + key, onclick: () => quickAnswer(key) }, QUICK[key].label));
    });
  }

  function quickAnswer(key) {
    const q = QUICK[key];
    logHistory(q.text, 'respuesta');
    speak(q.text);
    go({ v: 'display', text: q.text, kind: 'respuesta', quick: key });
  }

  function phraseBox() {
    const box = h('div', { class: 'phrase-box', 'aria-live': 'polite', 'aria-label': 'Frase en construcción' });
    if (S.buffer.length) {
      box.append(S.buffer, h('span', { class: 'cursor', 'aria-hidden': 'true' }));
    } else {
      box.append(h('span', { class: 'placeholder', text: 'La frase está vacía. Elige palabras o letras.' }));
    }
    return box;
  }

  function renderList(vm) {
    const r = S.route;

    if (vm.phraseBox) $main.append(phraseBox());
    else if (vm.showStrip !== false && S.buffer.trim() && r.v !== 'builder') {
      $main.append(h('button', { type: 'button', class: 'phrase-strip', onclick: () => go({ v: 'builder' }) },
        h('small', { text: 'Frase en construcción (tocar para abrir):' }), S.buffer.trim()));
    }

    $main.append(h('div', { class: 'toolbar' },
      btn('▶ Escanear opciones', startScan, 'info', { 'aria-label': 'Empezar modo escaneo' })));

    if (r.v === 'cat' && vm.options.length === 0) {
      $main.append(h('p', { class: 'hint', text: 'No hay opciones en esta categoría.' }));
    }

    const grid = h('div', { class: 'grid ' + (vm.gridClass || '') });
    vm.options.forEach(o => {
      const content = o.icon ? [h('span', { class: 'icon', 'aria-hidden': 'true', text: o.icon }), h('span', { text: o.label })] : o.label;
      grid.append(btn(content, o.run, o.cls));
    });
    $main.append(grid);

    if (r.v === 'home') {
      $main.append(
        h('div', { class: 'row', style: 'margin-top:20px' },
          btn('Historial', () => go({ v: 'history' }), 'action'),
          btn('Ajustes', () => go({ v: 'settings' }), 'action')),
        h('p', { class: 'footer-note', text: 'Herramienta de apoyo a la comunicación. No es un dispositivo médico ni reemplaza al personal de salud.' })
      );
    }
  }

  function renderScan(vm) {
    const opts = vm.options.filter(o => !o.noScan);
    const stop = btn('■ Salir del escaneo', stopScan, 'neutral');

    if (vm.phraseBox) $main.append(phraseBox());

    if (S.scanIdx >= opts.length) {
      $main.append(
        h('div', { class: 'bigtext', style: 'font-size:calc(1.8rem * var(--scale))' }, 'Fin de la lista. No eligió ninguna opción.'),
        h('div', { class: 'stack' },
          btn('↺ Empezar de nuevo', () => { S.scanIdx = 0; render(); }, 'info big'),
          btn('◀ Volver a la última opción', () => { S.scanIdx = Math.max(0, opts.length - 1); render(); }, 'action'),
          stop)
      );
      return;
    }

    const o = opts[S.scanIdx];
    const label = (o.icon ? o.icon + ' ' : '') + o.label + (o.cls && o.cls.includes('sub') ? ' ›' : '');
    const size = o.label.length <= 3 ? 'calc(5rem * var(--scale))' : o.label.length <= 18 ? 'calc(2.4rem * var(--scale))' : 'calc(1.9rem * var(--scale))';

    $main.append(
      h('p', { class: 'counter', text: 'Opción ' + (S.scanIdx + 1) + ' de ' + opts.length + ' · Lee la opción en voz alta y observa su respuesta' }),
      h('div', { class: 'bigtext scan' + (o.urgent ? ' urgent' : ''), style: 'font-size:' + size, 'aria-live': 'polite' }, label)
    );

    if (S.scanUnclear) {
      $main.append(h('div', { class: 'note', text: 'Respuesta no clara. Repite la opción despacio. Si sigue sin estar clara, pasen a la siguiente o descansen un momento.' }));
    }

    $main.append(h('div', { class: 'stack' },
      btn('✓ Asintió — elegir', () => { S.scanUnclear = false; o.run(); }, 'yes big'),
      btn('Negó — siguiente ▶', () => { S.scanIdx++; S.scanUnclear = false; render(); }, 'no big'),
      h('div', { class: 'row' },
        btn('◀ Anterior', () => { S.scanIdx = Math.max(0, S.scanIdx - 1); S.scanUnclear = false; render(); }, 'action', { disabled: S.scanIdx === 0 ? true : null }),
        btn('? No está clara', () => { S.scanUnclear = true; render(); }, 'action')),
      ttsSupported ? btn('🔊 Leer opción', () => speak(o.label, true), 'action') : null,
      stop
    ));
  }

  function renderConfirm() {
    const r = S.route;

    if (r.urgent) {
      $main.append(h('div', { class: 'banner-urgent', text: '⚠ Si hay cualquier duda sobre su respiración, avise al personal de salud AHORA. No espere a confirmar.' }));
    }

    $main.append(
      h('p', { class: 'question', text: 'Pregúntale: “¿Quieres decir…?”' }),
      h('div', { class: 'bigtext' + (r.urgent ? ' urgent' : ''), style: 'font-size:' + (r.text.length <= 20 ? 'calc(2.4rem * var(--scale))' : 'calc(1.8rem * var(--scale))') }, '“' + r.text + '”'),
      h('p', { class: 'hint', text: 'Marca solo lo que ella indique con la cabeza. Si dudas, usa “No está clara”.' })
    );

    if (r.unclear) {
      $main.append(h('div', { class: 'note', text: 'Respuesta no clara. Repite la pregunta despacio, con una sola idea. Si sigue sin estar clara, descansen unos minutos o pidan apoyo al personal.' }));
    }

    const stackEl = h('div', { class: 'stack' },
      btn('✓ SÍ — asintió', onConfirmYes, 'yes big'),
      btn('✗ NO — negó', onConfirmNo, 'no big'),
      btn('? No está clara', onConfirmUnclear, 'action'));

    if (r.source === 'item') {
      stackEl.append(btn('+ Añadir a la frase (sin enviar)', () => {
        appendWord(r.text.replace(/[.]$/, ''));
        toast('Añadido a la frase');
        back();
      }, 'action'));
    }
    if (ttsSupported) stackEl.append(btn('🔊 Leer la pregunta', () => speak('¿Quieres decir: ' + r.text + '?', true), 'action'));
    $main.append(stackEl);
  }

  function onConfirmYes() {
    const r = S.route;
    logHistory(r.text, r.urgent ? 'urgente' : 'mensaje');
    if (r.source === 'builder') setBuffer('');
    speak(r.text);
    // Se reemplaza la vista de confirmación por la de mensaje (no se apila).
    S.route = { v: 'display', text: r.text, urgent: r.urgent, kind: 'mensaje' };
    S.scanUnclear = false;
    render();
  }

  function onConfirmNo() {
    toast('No era eso. Elige otra opción.');
    back();
  }

  function onConfirmUnclear() {
    logHistory('Respuesta no clara a: “' + S.route.text + '”', 'no-claro');
    S.route.unclear = true;
    render();
  }

  function renderDisplay() {
    const r = S.route;
    const wrap = h('div', { class: 'display' + (r.urgent ? ' urgent' : '') });

    if (r.urgent) wrap.append(h('div', { class: 'banner-urgent', style: 'background:#000', text: 'URGENTE — Avise al personal de salud' }));
    if (r.kind === 'mensaje') wrap.append(h('p', { class: 'counter', style: r.urgent ? 'color:#fff' : null, text: 'Mensaje confirmado por ella' }));
    if (r.kind === 'historial') wrap.append(h('p', { class: 'counter', text: 'Mensaje del historial (' + fmtTime(r.ts) + ')' }));

    wrap.append(h('div', { class: 'bigtext' + (r.urgent ? ' urgent' : ''), id: 'fit', role: 'status', 'aria-live': 'assertive' }, r.text));

    const actions = h('div', { class: 'stack' });
    if (ttsSupported) actions.append(btn('🔊 Decir en voz alta', () => speak(r.text, true), 'action'));

    if (r.kind === 'mensaje') {
      actions.append(btn('Listo — volver al inicio', goHome, 'info big'));
    } else if (r.quick === 'cancelar') {
      actions.append(btn('Listo — volver al inicio', () => { S.scanning = false; goHome(); }, 'info big'));
    } else {
      actions.append(btn('Listo — volver', back, 'info big'));
    }
    wrap.append(actions);
    $main.append(wrap);
  }

  /* Ajusta el tamaño del texto grande para que quepa en su caja. */
  function fitText() {
    const el = document.getElementById('fit');
    if (!el) return;
    const maxPx = Math.min(window.innerWidth * 0.28, 160);
    let size = maxPx;
    el.style.fontSize = size + 'px';
    let guard = 0;
    while ((el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) && size > 20 && guard < 60) {
      size -= 4;
      el.style.fontSize = size + 'px';
      guard++;
    }
  }
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (S.route.v === 'display') fitText(); }, 150);
  });

  function renderHistory() {
    const labels = {
      mensaje: 'Confirmado',
      urgente: 'Confirmado · URGENTE',
      respuesta: 'Respuesta rápida',
      'no-claro': 'Respuesta no clara'
    };

    $main.append(h('p', { class: 'hint', text: 'Se guarda solo en este teléfono. Toca un mensaje para mostrarlo en grande.' }));

    if (!S.history.length) {
      $main.append(h('p', { class: 'hint', style: 'font-size:var(--fs)', text: 'Todavía no hay mensajes.' }));
      return;
    }

    $main.append(h('div', { class: 'toolbar' }, btn('🗑 Borrar historial', () => {
      if (window.confirm('¿Borrar todo el historial? No se puede deshacer.')) {
        S.history = [];
        save(KEYS.history, S.history);
        toast('Historial borrado');
        render();
      }
    }, 'no')));

    const list = h('ul', { class: 'hist' });
    S.history.forEach(item => {
      list.append(h('li', { class: 'k-' + item.kind },
        h('button', {
          type: 'button',
          onclick: () => go({ v: 'display', text: item.text, urgent: item.kind === 'urgente', kind: 'historial', ts: item.ts })
        },
          h('span', { class: 'meta', text: fmtTime(item.ts) + ' · ' + (labels[item.kind] || item.kind) }),
          h('span', { class: 'txt', text: item.text }))));
    });
    $main.append(list);
  }

  function setSetting(key, value) {
    S.settings[key] = value;
    save(KEYS.settings, S.settings);
    if (key === 'wake') updateWakeLock();
    render();
  }

  function choice(label, current, value, key) {
    return btn(label, () => setSetting(key, value), 'action', { 'aria-pressed': String(current === value) });
  }

  function renderSettings() {
    const st = S.settings;

    $main.append(
      h('h2', { class: 'section-title', text: 'Tamaño de letra' }),
      h('div', { class: 'row' },
        choice('Normal', st.scale, 1, 'scale'),
        choice('Grande', st.scale, 1.15, 'scale'),
        choice('Muy grande', st.scale, 1.3, 'scale')),

      h('h2', { class: 'section-title', text: 'Colores' }),
      h('div', { class: 'row' },
        choice('Fondo negro', st.theme, 'dark', 'theme'),
        choice('Fondo blanco', st.theme, 'light', 'theme'))
    );

    // Voz
    $main.append(h('h2', { class: 'section-title', text: 'Voz al confirmar mensajes' }));
    if (!ttsSupported) {
      $main.append(h('p', { class: 'status', text: 'Este navegador no permite leer en voz alta. Los mensajes se muestran solo en pantalla.' }));
    } else {
      $main.append(
        h('div', { class: 'row' },
          choice('Activada', st.voice, true, 'voice'),
          choice('Desactivada', st.voice, false, 'voice')),
        h('div', { class: 'toolbar', style: 'margin-top:12px' }, btn('🔊 Probar voz', () => speak('Hola, esta es la voz de prueba.', true), 'action')),
        h('p', { class: 'status', text: esVoice ? 'Voz en español encontrada: ' + esVoice.name + ' (' + esVoice.lang + ').' : 'No se detectó una voz en español. Puede sonar con acento extranjero o no sonar. Revisa la configuración de “Texto a voz” de Android.' })
      );
    }

    // Pantalla encendida
    $main.append(h('h2', { class: 'section-title', text: 'Mantener la pantalla encendida' }));
    if (!('wakeLock' in navigator)) {
      $main.append(h('p', { class: 'status', text: 'Este navegador no lo permite. Aumenta el tiempo de apagado de pantalla en los ajustes del teléfono.' }));
    } else {
      $main.append(h('div', { class: 'row' },
        choice('Sí', st.wake, true, 'wake'),
        choice('No', st.wake, false, 'wake')));
    }

    // Frases personalizadas
    $main.append(
      h('h2', { class: 'section-title', text: 'Frases personalizadas' }),
      h('p', { class: 'hint', text: 'Por ejemplo, nombres de familiares (“Quiero ver a …”) o frases que ella usa. Aparecen primero en su categoría, marcadas con ★.' })
    );
    const select = h('select', { class: 'input', id: 'custom-cat', 'aria-label': 'Categoría' },
      VOCAB.map(c => h('option', { value: c.id, text: c.title })));
    const input = h('input', { class: 'input', id: 'custom-text', type: 'text', maxlength: '80', placeholder: 'Escribe la frase', 'aria-label': 'Frase nueva', autocomplete: 'off' });
    const addCustom = () => {
      const text = input.value.trim().replace(/\s+/g, ' ');
      if (!text) { toast('Escribe una frase'); return; }
      const id = select.value;
      const list = S.custom[id] || [];
      if (list.some(t => t.toLowerCase() === text.toLowerCase())) { toast('Esa frase ya existe'); return; }
      list.unshift(text);
      S.custom[id] = list;
      save(KEYS.custom, S.custom);
      toast('Frase añadida');
      render();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addCustom(); });
    $main.append(
      h('div', { class: 'field' }, h('label', { for: 'custom-cat', text: 'Categoría' }), select),
      h('div', { class: 'field' }, h('label', { for: 'custom-text', text: 'Frase' }), input),
      h('div', { class: 'toolbar' }, btn('+ Añadir frase', addCustom, 'yes'))
    );

    const ul = h('ul', { class: 'custom-list' });
    let count = 0;
    VOCAB.forEach(c => {
      (S.custom[c.id] || []).forEach((t, i) => {
        count++;
        ul.append(h('li', null,
          h('span', { text: c.title + ': ' + t }),
          h('button', {
            type: 'button', class: 'btn no', onclick: () => {
              if (!window.confirm('¿Eliminar “' + t + '”?')) return;
              S.custom[c.id].splice(i, 1);
              save(KEYS.custom, S.custom);
              render();
            }
          }, 'Eliminar')));
      });
    });
    $main.append(count ? ul : h('p', { class: 'status', text: 'Aún no hay frases personalizadas.' }));

    // Datos
    $main.append(
      h('h2', { class: 'section-title', text: 'Datos' }),
      h('p', { class: 'hint', text: 'Todo se guarda solo en este teléfono. Si se borran los datos del navegador, se pierde.' }),
      h('div', { class: 'toolbar' }, btn('Borrar todo (ajustes, frases e historial)', () => {
        if (!window.confirm('¿Borrar TODOS los datos de Comunica en este teléfono?')) return;
        Object.values(KEYS).forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* sin acceso */ } });
        S.settings = Object.assign({}, DEFAULT_SETTINGS);
        S.custom = {};
        S.history = [];
        S.buffer = '';
        toast('Datos borrados');
        goHome();
      }, 'no')),

      h('h2', { class: 'section-title', text: 'Aviso importante' }),
      h('div', { class: 'note', text: 'Comunica es una herramienta auxiliar de comunicación. No es un dispositivo médico certificado, no diagnostica, no interpreta movimientos automáticamente y no reemplaza la comunicación con el personal de salud. Ante cualquier signo de dificultad para respirar, avise de inmediato al personal.' }),
      h('p', { class: 'status', text: 'Versión ' + APP_VERSION })
    );
  }

  /* ---------------- Inicio ---------------- */
  render();
  updateWakeLock();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
    });
  }
})();
