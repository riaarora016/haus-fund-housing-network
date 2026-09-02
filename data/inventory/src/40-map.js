// Map engine: inlined tile pyramid (satellite + labels, street mode), Web Mercator, smooth camera with
// inertia and pinch, screen-constant markers with clustering and chip collision, overlays, search-this-area.
(function () {
  const C = HFI.CONFIG, $ = HFI.$, esc = HFI.esc;
  HFI.createMap = (root, T, opts = {}) => {
    const TS = 256, TZ = T.z, N = 2 ** TZ, MW = T.cols * TS, MH = T.rows * TS;
    const mx = (lng) => ((lng + 180) / 360) * N, my = (lat) => ((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2) * N;
    const px = (lng) => (mx(lng) - T.x0) * TS, py = (lat) => (my(lat) - T.y0) * TS;
    const lngOf = (x) => (x / TS + T.x0) / N * 360 - 180, latOf = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (y / TS + T.y0) / N))) * 180 / Math.PI;
    const anchor = opts.anchor;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'map'); svg.setAttribute('role', 'application'); svg.setAttribute('aria-label', 'Housing map'); svg.setAttribute('tabindex', '0');
    root.appendChild(svg);
    const tileLayer = (levels, cls) => { let o = `<g class="tiles ${cls}">`; for (const L of levels || []) { const f = TS * 2 ** (TZ - L.z); for (const t of L.tiles) o += `<image href="data:${L.mime};base64,${t.d}" x="${(t.x * f - T.x0 * TS).toFixed(1)}" y="${(t.y * f - T.y0 * TS).toFixed(1)}" width="${(f + 0.6).toFixed(1)}" height="${(f + 0.6).toFixed(1)}"/>`; } return o + '</g>'; };
    svg.innerHTML = `<g id="street" style="display:none">${tileLayer(T.street, 'street')}</g><g id="satbase">${tileLayer(T.base, 'base')}</g><g id="hitiles" style="display:none">${tileLayer(T.hi, 'hi')}</g><g id="ovl"></g><g id="clusters"></g><g id="mks"></g><g id="anchor" style="pointer-events:none"></g>`;
    const layers = { street: $('#street', svg), satbase: $('#satbase', svg), hi: $('#hitiles', svg), ovl: $('#ovl', svg), clusters: $('#clusters', svg), mks: $('#mks', svg), anchor: $('#anchor', svg) };
    const listeners = {}; const emit = (e, ...a) => (listeners[e] || []).forEach((f) => f(...a));
    let mode = 'sat', view = { x: 0, y: 0, w: MW, h: MH }, markers = new Map(), order = [], selected = null, hovered = null, overlays = { rings: true, neighborhoods: false, haus: true, candidates: true, signed: true };
    const rect = () => svg.getBoundingClientRect();
    const kOf = () => { const r = rect(); return r.width ? view.w / r.width : view.w / 1000; };

    // ---- camera ----
    function applyView() {
      const r = rect(); const a = r.width > 0 && r.height > 0 ? r.height / r.width : MH / MW;
      const maxW = Math.max(MW, MH / a) * 1.15;
      view.w = Math.min(maxW, Math.max(MW / C.MAP.MAX_ZOOM_FACTOR, view.w)); view.h = view.w * a;
      view.x = view.w >= MW ? (MW - view.w) / 2 : Math.min(MW - view.w, Math.max(0, view.x));
      view.y = view.h >= MH ? (MH - view.h) / 2 : Math.min(MH - view.h, Math.max(0, view.y));
      svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); rescale(); scheduleMoveEnd();
    }
    let anim = null, guard = null;
    function animateTo(to, ms = C.MAP.FLY_MS) {
      if (anim) cancelAnimationFrame(anim); if (guard) clearTimeout(guard);
      const from = { ...view }, t0 = performance.now();
      const step = (t) => { const u = Math.min(1, (t - t0) / ms), e = 1 - (1 - u) ** 3; view = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: 0 }; applyView(); if (u < 1) anim = requestAnimationFrame(step); else { anim = null; clearTimeout(guard); guard = null; } };
      anim = requestAnimationFrame(step);
      guard = setTimeout(() => { if (anim) { cancelAnimationFrame(anim); anim = null; } view = { ...to, h: 0 }; applyView(); }, ms + 250); // hidden tabs pause animation frames
    }
    const zoomTarget = (cx, cy, f, base = view) => ({ x: cx - (cx - base.x) / f, y: cy - (cy - base.y) / f, w: base.w / f, h: 0 });
    const clientToMap = (cx, cy) => { const r = rect(); return [view.x + (cx - r.left) / r.width * view.w, view.y + (cy - r.top) / r.height * view.h]; };
    let wheelAcc = 0, wheelTimer = null;
    svg.addEventListener('wheel', (ev) => { ev.preventDefault(); const [cx, cy] = clientToMap(ev.clientX, ev.clientY); const f = ev.ctrlKey ? Math.exp(-ev.deltaY * 0.01) : (ev.deltaY < 0 ? 1.35 : 1 / 1.35); animateTo(zoomTarget(cx, cy, f), ev.ctrlKey ? 60 : 160); }, { passive: false });
    svg.addEventListener('dblclick', (ev) => { ev.preventDefault(); const [cx, cy] = clientToMap(ev.clientX, ev.clientY); animateTo(zoomTarget(cx, cy, 2), 300); });
    // drag with inertia, pinch with two pointers
    const ptrs = new Map(); let drag = null, moved = false, vel = { x: 0, y: 0 }, lastT = 0, pinch = null;
    svg.addEventListener('pointerdown', (ev) => { if (anim) { cancelAnimationFrame(anim); anim = null; clearTimeout(guard); } ptrs.set(ev.pointerId, ev); if (ptrs.size === 1) { drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, cap: false }; moved = false; vel = { x: 0, y: 0 }; lastT = performance.now(); } else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), w: view.w }; drag = null; } });
    svg.addEventListener('pointermove', (ev) => { if (!ptrs.has(ev.pointerId)) return; ptrs.set(ev.pointerId, ev); const r = rect();
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); const midX = (a.clientX + b.clientX) / 2, midY = (a.clientY + b.clientY) / 2; const [cx, cy] = clientToMap(midX, midY); const f = (pinch.w / view.w) * (d / pinch.d); view = zoomTarget(cx, cy, f); applyView(); moved = true; return; }
      if (!drag) return;
      const dx = (ev.clientX - drag.x) / r.width * view.w, dy = (ev.clientY - drag.y) / r.height * view.h;
      if (!moved && Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 4) { moved = true; svg.classList.add('panning'); drag.cap = true; svg.setPointerCapture(ev.pointerId); }
      if (moved) { const t = performance.now(), dt = Math.max(1, t - lastT); vel = { x: (drag.vx - dx - view.x) / dt, y: (drag.vy - dy - view.y) / dt }; lastT = t; view.x = drag.vx - dx; view.y = drag.vy - dy; applyView(); } });
    const endPtr = (ev) => { ptrs.delete(ev.pointerId); if (ptrs.size < 2) pinch = null; if (ptrs.size === 0) { const wasDrag = drag && moved; drag = null; svg.classList.remove('panning'); if (wasDrag && performance.now() - lastT < 80 && Math.hypot(vel.x, vel.y) > 0.02) inertia(); } };
    svg.addEventListener('pointerup', endPtr); svg.addEventListener('pointercancel', endPtr);
    function inertia() { let v = { ...vel }; let last = performance.now(); const step = (t) => { const dt = Math.min(40, t - last); last = t; view.x += v.x * dt; view.y += v.y * dt; v.x *= 0.92; v.y *= 0.92; applyView(); if (Math.hypot(v.x, v.y) > 0.005) anim = requestAnimationFrame(step); else anim = null; }; anim = requestAnimationFrame(step); }
    svg.addEventListener('keydown', (ev) => { const step = view.w * 0.1; const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }; if (map[ev.key]) { view.x += map[ev.key][0]; view.y += map[ev.key][1]; applyView(); ev.preventDefault(); } if (ev.key === '+' || ev.key === '=') api.zoomIn(); if (ev.key === '-') api.zoomOut(); });
    // move end (debounced) for "search this area"
    let settled = null, moveTimer = null;
    function scheduleMoveEnd() { if (moveTimer) clearTimeout(moveTimer); moveTimer = setTimeout(() => { if (!settled) { settled = { ...view }; return; } const dx = Math.abs(view.x - settled.x) / view.w, dy = Math.abs(view.y - settled.y) / view.h, dz = Math.abs(Math.log(view.w / settled.w)); emit('moveend', { moved: dx > C.MAP.SEARCH_AREA_MOVE_FRACTION || dy > C.MAP.SEARCH_AREA_MOVE_FRACTION || dz > 0.4, bounds: api.getBounds() }); }, 260); }

    // ---- markers ----
    function markerSvg(m) {
      const dim = m.dim ? ' dim' : '', sel = m.id === selected ? ' sel' : '', hov = m.id === hovered ? ' hov' : '';
      if (m.kind === 'haus') return `<g class="mk haus${dim}${sel}${hov}${m.approx ? ' approx' : ''}" data-id="${m.id}" data-x="${px(m.lng).toFixed(1)}" data-y="${py(m.lat).toFixed(1)}" data-w="0" role="button" tabindex="0" aria-label="${esc(m.aria)}"><title>${esc(m.aria)}</title><rect x="-9" y="-9" width="18" height="18" rx="3" transform="rotate(45)"/><text y="-16" text-anchor="middle" font-size="12" font-weight="700">${esc(m.label)}</text></g>`;
      const w = m.label ? Math.max(34, m.label.length * 7.4 + 18) : 0;
      return `<g class="mk cand ${m.tone || ''}${dim}${sel}${hov}${m.approx ? ' approx' : ''}${m.signed ? ' signed' : ''}${m.deal ? ' deal' : ''}" data-id="${m.id}" data-x="${px(m.lng).toFixed(1)}" data-y="${py(m.lat).toFixed(1)}" data-w="${w}" role="button" tabindex="0" aria-label="${esc(m.aria)}"><title>${esc(m.aria)}</title><circle class="mdot" r="4.6"/>${m.status ? `<circle class="sdot" cx="5.5" cy="-5.5" r="3"/>` : ''}${m.label ? `<g class="pill${m.est ? ' est' : ''}" visibility="hidden"><rect x="${(-w / 2).toFixed(0)}" y="-34" width="${w}" height="23" rx="11.5"/><text y="-17.5" text-anchor="middle" font-size="12.5">${esc(m.label)}</text></g>` : ''}</g>`;
    }
    function setMarkers(list) {
      order = list.slice().sort((a, b) => (a.kind === 'haus' ? -1 : 0) - (b.kind === 'haus' ? -1 : 0) || (b.priority || 0) - (a.priority || 0));
      layers.mks.innerHTML = order.map(markerSvg).join('');
      markers = new Map(); for (const el of layers.mks.querySelectorAll('.mk')) { const id = el.dataset.id; markers.set(id, el);
        el.addEventListener('click', (e) => { e.stopPropagation(); if (!moved) emit('select', id); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); emit('select', id); } });
        el.addEventListener('pointerenter', () => emit('hover', id)); el.addEventListener('pointerleave', () => emit('hover', null)); }
      rescale();
    }
    function rescale() {
      const r = rect(); if (!r.width) return; const k = view.w / r.width;
      layers.hi.style.display = mode === 'sat' && T.hi && T.hi.length && k < C.MAP.HI_TILE_K ? '' : 'none';
      const shown = []; const clusterCells = new Map(); const cell = C.MAP.CLUSTER_CELL_PX; const clustering = k >= C.MAP.CLUSTER_MIN_K && overlays.candidates;
      const bring = [];
      for (const m of order) {
        const el = markers.get(m.id); if (!el) continue;
        const X = +el.dataset.x, Y = +el.dataset.y, sx = (X - view.x) / k, sy = (Y - view.y) / k;
        el.setAttribute('transform', `translate(${X} ${Y}) scale(${k.toFixed(4)})`);
        const isSel = m.id === selected, isHaus = m.kind === 'haus';
        const visibleLayer = isHaus ? overlays.haus : m.signed ? overlays.signed : overlays.candidates;
        if (!visibleLayer) { el.style.display = 'none'; continue; }
        const onscreen = sx > -80 && sx < r.width + 80 && sy > -60 && sy < r.height + 60;
        // clustering at city scale: candidates only, never Haus, never the selection
        if (clustering && !isHaus && !isSel && !m.dim && onscreen) {
          const key = `${Math.floor(sx / cell)}:${Math.floor(sy / cell)}`; const c = clusterCells.get(key) || { ids: [], sx: 0, sy: 0, X: 0, Y: 0 }; c.ids.push(m.id); c.sx += sx; c.sy += sy; c.X += X; c.Y += Y; clusterCells.set(key, c);
        }
        el.style.display = '';
        const pill = el.querySelector('.pill'); if (!pill) continue;
        if (m.dim) { pill.setAttribute('visibility', 'hidden'); continue; }
        const w = +el.dataset.w, box = { x: sx - w / 2 - 2, y: sy - 36, w: w + 4, h: 27 };
        const nearAnchor = anchor && Math.abs(sx - (px(anchor.lng) - view.x) / k) < 60 && Math.abs(sy - (py(anchor.lat) - view.y) / k) < 46;
        const collides = shown.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h);
        if (onscreen && !nearAnchor && (isSel || !collides) && !(clustering && !isSel)) { pill.setAttribute('visibility', 'visible'); shown.push(box); } else pill.setAttribute('visibility', 'hidden');
        if (isSel) bring.push(el);
      }
      // clusters: hide members, draw one bubble with a count
      let ch = '';
      if (clustering) for (const [, c] of clusterCells) { if (c.ids.length < 2) continue; const n = c.ids.length; for (const id of c.ids) { const el = markers.get(id); if (el) el.style.display = 'none'; } const X = c.X / n, Y = c.Y / n; const rad = Math.min(22, 12 + n); ch += `<g class="cluster" data-ids="${c.ids.join(',')}" transform="translate(${X.toFixed(1)} ${Y.toFixed(1)}) scale(${k.toFixed(4)})" role="button" tabindex="0" aria-label="${n} listings, zoom in"><circle r="${rad}"/><text text-anchor="middle" dy="4.5" font-size="12.5" font-weight="700">${n}</text></g>`; }
      layers.clusters.innerHTML = ch;
      for (const el of layers.clusters.querySelectorAll('.cluster')) el.addEventListener('click', (e) => { e.stopPropagation(); const t = el.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/); animateTo(zoomTarget(+t[1], +t[2], 2.2), 320); });
      for (const el of bring) layers.mks.appendChild(el); // selected marker on top
      // overlays
      let o = '';
      if (anchor && overlays.rings) { const fx = px(anchor.lng), fy = py(anchor.lat); const mileDeg = 1 / (69.17 * Math.cos(anchor.lat * Math.PI / 180)); const pxMile = px(anchor.lng + mileDeg) - fx;
        for (const [mi, lab] of [[0.5, '~10 min walk'], [1, '~20 min walk'], [1.5, '~30 min walk']]) { const rr = mi * pxMile; o += `<circle class="ring" cx="${fx}" cy="${fy}" r="${rr.toFixed(0)}" stroke-width="${(1.3 * k).toFixed(1)}" stroke-dasharray="${(4 * k).toFixed(1)} ${(6 * k).toFixed(1)}"/><text class="ring-l" x="${fx}" y="${(fy - rr - 5 * k).toFixed(0)}" text-anchor="middle" font-size="${(11 * k).toFixed(1)}" stroke-width="${(3 * k).toFixed(1)}">${lab}</text>`; } }
      if (overlays.neighborhoods && opts.neighborhoods) for (const [name, ll] of Object.entries(opts.neighborhoods)) { const X = px(ll[1]), Y = py(ll[0]); o += `<g class="nb" transform="translate(${X.toFixed(0)} ${Y.toFixed(0)}) scale(${k.toFixed(4)})"><circle r="30" /><text text-anchor="middle" dy="4" font-size="11.5" font-weight="700">${esc(name)}</text></g>`; }
      layers.ovl.innerHTML = o;
      if (anchor) layers.anchor.innerHTML = `<g transform="translate(${px(anchor.lng).toFixed(1)} ${py(anchor.lat).toFixed(1)}) scale(${k.toFixed(4)})"><circle r="15" class="halo"/><rect x="-8" y="-8" width="16" height="16" rx="3" transform="rotate(45)"/><text y="-16" text-anchor="middle" font-size="12" font-weight="700">${esc(anchor.name)}</text></g>`;
    }
    svg.addEventListener('click', () => emit('select', null));
    new ResizeObserver(() => applyView()).observe(svg);

    const api = {
      el: svg,
      on: (e, f) => ((listeners[e] ??= []).push(f), api),
      setMode: (m) => { mode = m; layers.street.style.display = m === 'map' ? '' : 'none'; layers.satbase.style.display = m === 'map' ? 'none' : ''; rescale(); },
      getMode: () => mode,
      setMarkers, rescale,
      setSelected: (id) => { selected = id; for (const [mid, el] of markers) el.classList.toggle('sel', mid === id); rescale(); },
      setHover: (id) => { hovered = id; for (const [mid, el] of markers) el.classList.toggle('hov', mid === id); },
      setOverlay: (n, on) => { overlays[n] = on; rescale(); },
      getOverlays: () => ({ ...overlays }),
      zoomIn: () => animateTo(zoomTarget(view.x + view.w / 2, view.y + view.h / 2, 1.6)),
      zoomOut: () => animateTo(zoomTarget(view.x + view.w / 2, view.y + view.h / 2, 1 / 1.6)),
      flyTo: (lat, lng, factor = 8) => { const r = rect(); const a = r.height / Math.max(1, r.width); const w = MW / factor; animateTo({ x: px(lng) - w / 2, y: py(lat) - w * a / 2, w, h: 0 }, C.MAP.FLY_MS); },
      fitPoints: (pts, pad = 0.18) => { const r = rect(); const a = r.height / Math.max(1, r.width); const xs = pts.map((p) => px(p.lng)), ys = pts.map((p) => py(p.lat)); if (!xs.length) return api.home(); let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); const w0 = Math.max(x1 - x0, (y1 - y0) / a) * (1 + pad * 2); const w = Math.max(MW / C.MAP.MAX_ZOOM_FACTOR, w0); animateTo({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w * a / 2, w, h: 0 }, C.MAP.FLY_MS); },
      home: () => { const r = rect(); const a = r.width > 0 && r.height > 0 ? r.height / r.width : MH / MW; view = { x: 0, y: 0, w: Math.max(MW, MH / a), h: 0 }; applyView(); settled = { ...view }; },
      markSettled: () => { settled = { ...view }; },
      getBounds: () => ({ n: latOf(view.y), s: latOf(view.y + view.h), w: lngOf(view.x), e: lngOf(view.x + view.w) }),
      getView: () => ({ lat: latOf(view.y + view.h / 2), lng: lngOf(view.x + view.w / 2), z: +(MW / view.w).toFixed(2) }),
      setView: (v) => { const r = rect(); const a = r.height / Math.max(1, r.width); const w = MW / (v.z || 1); view = { x: px(v.lng) - w / 2, y: py(v.lat) - w * a / 2, w, h: 0 }; applyView(); settled = { ...view }; },
      resize: () => applyView(),
    };
    api.home();
    return api;
  };
})();
