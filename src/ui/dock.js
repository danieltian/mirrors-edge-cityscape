// Minimal control strip along the bottom edge. It fades away when the mouse
// is idle so the city stays the focus.

const ICON_GEAR = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>`;

const HINTS = {
  persp: 'Drag to look · Right-drag to pan · Scroll to zoom · WASD to fly · Q/E down/up · Shift for speed',
  iso: 'Drag to pan · Right-drag to rotate · Scroll to zoom · WASD to move · Q/E rotate 90°',
};

export function createDock({ director, getAccents, setAccents, toggleSettings, newCity, getMusic, toggleMusic, nextTune }) {
  const el = document.createElement('div');
  el.className = 'dock';
  el.innerHTML = `
    <div class="seg" role="group" aria-label="Camera mode">
      <button data-mode="drift" title="Drift (Space)">Drift</button>
      <button data-mode="explore" title="Explore (Space)">Explore</button>
    </div>
    <div class="seg" role="group" aria-label="Projection">
      <button data-proj="persp" title="Perspective (I)">Perspective</button>
      <button data-proj="iso" title="Isometric (I)">Isometric</button>
    </div>
    <button data-act="random" class="solo" title="Jump to a random viewpoint (R)">Random view</button>
    <span class="sep" aria-hidden="true"></span>
    <button data-act="tour" class="toggle" title="Cycle viewpoints automatically (T)">Tour</button>
    <button data-act="accents" class="toggle" title="Colour accents (C)">Accents</button>
    <button data-act="music" class="toggle" title="Music (M) · next tune (Shift+M)">Music</button>
    <button data-act="settings" class="icon" title="Settings (G)" aria-label="Settings">${ICON_GEAR}</button>
  `;
  document.body.appendChild(el);

  const hint = document.createElement('div');
  hint.className = 'hint';
  document.body.appendChild(hint);
  const hinted = new Set();
  let hintTimer = 0;
  const showHint = (text) => {
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), 4500);
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode) director.setMode(b.dataset.mode);
    if (b.dataset.proj && b.dataset.proj !== director.projection) director.toggleProjection();
    const act = b.dataset.act;
    if (act === 'random') director.randomLocation();
    if (act === 'tour') director.setTour(!director.tour.on);
    if (act === 'accents') setAccents(!getAccents());
    if (act === 'music') toggleMusic();
    if (act === 'settings') toggleSettings();
    b.blur();
    sync();
  });

  // Auto-hide.
  let visible = true;
  let hideTimer = 0;
  let hovered = false;
  let hiddenByUser = false;
  const show = () => {
    if (hiddenByUser) return;
    if (!visible) {
      el.classList.remove('hidden');
      visible = true;
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!hovered) {
        el.classList.add('hidden');
        visible = false;
      }
    }, 2600);
  };
  el.addEventListener('pointerenter', () => (hovered = true));
  el.addEventListener('pointerleave', () => {
    hovered = false;
    show();
  });
  window.addEventListener('pointermove', show);
  window.addEventListener('pointerdown', show);
  show();

  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    let handled = true;
    if (k === ' ') director.toggleMode();
    else if (k === 'r') director.randomLocation();
    else if (k === 'i') director.toggleProjection();
    else if (k === 't') director.setTour(!director.tour.on);
    else if (k === 'c') setAccents(!getAccents());
    else if (k === 'm' && e.shiftKey) nextTune();
    else if (k === 'm') toggleMusic();
    else if (k === 'g') toggleSettings();
    else if (k === 'n') newCity();
    else if (k === 'h') {
      hiddenByUser = !hiddenByUser;
      el.classList.toggle('hidden', hiddenByUser);
      visible = !hiddenByUser;
    } else if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    } else handled = false;
    if (handled) {
      e.preventDefault();
      sync();
    }
  });

  function sync() {
    for (const b of el.querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === director.mode);
    const morphing = director.transition?.type === 'morph';
    for (const b of el.querySelectorAll('[data-proj]')) {
      b.classList.toggle('on', b.dataset.proj === director.projection);
      b.disabled = morphing;
    }
    el.querySelector('[data-act="tour"]').classList.toggle('on', director.tour.on);
    el.querySelector('[data-act="accents"]').classList.toggle('on', getAccents());
    el.querySelector('[data-act="music"]').classList.toggle('on', getMusic());
    if (director.mode === 'explore' && !morphing && !hinted.has(director.projection)) {
      hinted.add(director.projection);
      showHint(HINTS[director.projection]);
    }
  }

  return { sync, el };
}
