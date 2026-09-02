// Map engine: inlined tile pyramid (several satellite levels that switch as you zoom, labels, street mode),
// Web Mercator, smooth camera with inertia, trackpad scroll and pinch zoom, screen-constant markers with
// clustering and chip collision, overlays, search-this-area.
// T = { z, x0, y0, cols, rows, minK, levels: [{ z, maxK, layers: [{ mime, tiles: [{x, y, d}] }] }], street: [{ z, mime, tiles }] }
(function () {
  const C = HFI.CONFIG, $ = HFI.$, esc = HFI.esc;
  HFI.createMap = (root, T, opts = {}) => {
    const TS = 256, TZ = T.z, N = 2 ** TZ, MW = T.cols * TS, MH = T.rows * TS, MINK = T.minK || 0.125;
    const mx = (lng) => ((lng + 180) / 360) * N, my = (lat) => ((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2) * N;
    const px = (lng) => (mx(lng) - T.x0) * TS, py = (lat) => (my(lat) - T.y0) * TS;
    const lngOf = (x) => (x / TS + T.x0) / N * 360 - 180, latOf = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (y / TS + T.y0) / N))) * 180 / Math.PI;
    let anchor = opts.anchor || null, neighborhoods = opts.neighborhoods || null;
    root.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'map'); svg.setAttribute('role', 'application'); svg.setAttribute('aria-label', 'Housing map'); svg.setAttribute('tabindex', '0');
    root.appendChild(svg);
    const tileImgs = (L, z = L.z) => { const f = TS * 2 ** (TZ - z); let o = ''; for (const t of L.tiles) o += `<image href="data:${L.mime};base64,${t.d}" x="${(t.x * f - T.x0 * TS).toFixed(1)}" y="${(t.y * f - T.y0 * TS).toFixed(1)}" width="${(f + 0.6).toFixed(1)}" height="${(f + 0.6).toFixed(1)}"/>`; return o; };
    const levels = (T.levels || []).map((L, i) => ({ maxK: L.maxK ?? Infinity, id: `lvl${i}`, html: `<g class="tiles lvl" id="lvl${i}">${(L.layers || []).map((ly) => tileImgs(ly, L.z)).join('')}</g>` }));
    svg.innerHTML = `<g id="street" style="display:none"><g class="tiles street">${(T.street || []).map((ly) => tileImgs(ly, ly.z)).join('')}</g></g><g id="sat">${levels.map((l) => l.html).join('')}</g><g id="roads"></g><g id="ovl"></g><g id="clusters"></g><g id="mks"></g><g id="anchor" style="pointer-events:none"></g>`;
    const layers = { street: $('#street', svg), sat: $('#sat', svg), roads: $('#roads', svg), ovl: $('#ovl', svg), clusters: $('#clusters', svg), mks: $('#mks', svg), anchor: $('#anchor', svg) };
    const lvlEls = levels.map((l) => ({ ...l, el: $('#' + l.id, svg) }));
    const listeners = {}; const emit = (e, ...a) => (listeners[e] || []).forEach((f) => f(...a));
    let mode = 'sat', view = { x: 0, y: 0, w: MW, h: MH }, markers = new Map(), order = [], selected = null, hovered = null, overlays = { rings: true, neighborhoods: false, haus: true, candidates: true, signed: true };
    const rect = () => svg.getBoundingClientRect();
    const widthForZoom = (z) => Math.max(1, rect().width) * 2 ** (TZ - z);   // google-style zoom level -> viewBox width
    const zoomOf = () => +(TZ - Math.log2(view.w / Math.max(1, rect().width))).toFixed(2);

    // ---- camera ----
    function applyView() {
      const r = rect(); const a = r.width > 0 && r.height > 0 ? r.height / r.width : MH / MW;
      const maxW = Math.max(MW, MH / a) * 1.15, minW = r.width > 0 ? MINK * r.width : MW / 48;
      view.w = Math.min(maxW, Math.max(minW, view.w)); view.h = view.w * a;
      view.x = view.w >= MW ? (MW - view.w) / 2 : Math.min(MW - view.w, Math.max(0, view.x));
      view.y = view.h >= MH ? (MH - view.h) / 2 : Math.min(MH - view.h, Math.max(0, view.y));
      svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); rescale(); scheduleMoveEnd();
    }
    let anim = null, guard = null;
    function stopAnim() { if (anim) cancelAnimationFrame(anim); anim = null; if (guard) clearTimeout(guard); guard = null; }
    function animateTo(to, ms = C.MAP.FLY_MS, settle = false) {
      stopAnim(); programmatic = settle;
      const from = { ...view }, t0 = performance.now();
      const step = (t) => { const u = Math.min(1, (t - t0) / ms), e = 1 - (1 - u) ** 3; view = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: 0 }; applyView(); if (u < 1) anim = requestAnimationFrame(step); else { anim = null; clearTimeout(guard); guard = null; } };
      anim = requestAnimationFrame(step);
      guard = setTimeout(() => { if (anim) { cancelAnimationFrame(anim); anim = null; } view = { ...to, h: 0 }; applyView(); }, ms + 250); // hidden tabs pause animation frames
    }
    const zoomTarget = (cx, cy, f, base = view) => ({ x: cx - (cx - base.x) / f, y: cy - (cy - base.y) / f, w: base.w / f, h: 0 });
    const clientToMap = (cx, cy) => { const r = rect(); return [view.x + (cx - r.left) / r.width * view.w, view.y + (cy - r.top) / r.height * view.h]; };
    // wheel: trackpad pinch (ctrlKey) and two-finger scroll zoom continuously under the cursor; notched mouse wheels step
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault(); stopAnim(); programmatic = false;
      const [cx, cy] = clientToMap(ev.clientX, ev.clientY);
      let dy = ev.deltaY; if (ev.deltaMode === 1) dy *= 16; else if (ev.deltaMode === 2) dy *= 400;
      const notched = !ev.ctrlKey && Math.abs(dy) >= 40 && Number.isInteger(dy);
      if (notched) { animateTo(zoomTarget(cx, cy, dy < 0 ? C.MAP.WHEEL_STEP : 1 / C.MAP.WHEEL_STEP), 140); return; }
      const f = Math.exp(-dy * (ev.ctrlKey ? C.MAP.WHEEL_PINCH_RATE : C.MAP.WHEEL_SCROLL_RATE));
      view = zoomTarget(cx, cy, f); applyView();
    }, { passive: false });
    svg.addEventListener('dblclick', (ev) => { ev.preventDefault(); const [cx, cy] = clientToMap(ev.clientX, ev.clientY); animateTo(zoomTarget(cx, cy, 2), 300); });
    // drag with inertia, pinch with two pointers (touch)
    const ptrs = new Map(); let drag = null, moved = false, vel = { x: 0, y: 0 }, lastT = 0, pinch = null;
    svg.addEventListener('pointerdown', (ev) => { stopAnim(); programmatic = false; ptrs.set(ev.pointerId, ev); if (ptrs.size === 1) { drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, cap: false }; moved = false; vel = { x: 0, y: 0 }; lastT = performance.now(); } else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), w: view.w }; drag = null; } });
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
    let settled = null, moveTimer = null, programmatic = false;
    function scheduleMoveEnd() { if (moveTimer) clearTimeout(moveTimer); moveTimer = setTimeout(() => { if (!settled || programmatic) { settled = { ...view }; programmatic = false; emit('moveend', { moved: false, bounds: api.getBounds() }); return; } const dx = Math.abs(view.x - settled.x) / view.w, dy = Math.abs(view.y - settled.y) / view.h, dz = Math.abs(Math.log(view.w / settled.w)); emit('moveend', { moved: dx > C.MAP.SEARCH_AREA_MOVE_FRACTION || dy > C.MAP.SEARCH_AREA_MOVE_FRACTION || dz > 0.4, bounds: api.getBounds() }); }, 260); }

    // ---- markers ----
    function markerSvg(m) {
      const dim = m.dim ? ' dim' : '', sel = m.id === selected ? ' sel' : '', hov = m.id === hovered ? ' hov' : '';
      if (m.kind === 'haus') return `<g class="mk haus${dim}${sel}${hov}${m.approx ? ' approx' : ''}" data-id="${m.id}" data-x="${px(m.lng).toFixed(1)}" data-y="${py(m.lat).toFixed(1)}" data-w="0" role="button" tabindex="0" aria-label="${esc(m.aria)}"><title>${esc(m.aria)}</title><rect class="dia" x="-9" y="-9" width="18" height="18" rx="3" transform="rotate(45)"/>${labelPill(m.label, -30)}</g>`;
      const w = m.label ? Math.max(34, m.label.length * 7.4 + 18) : 0;
      return `<g class="mk cand ${m.tone || ''}${dim}${sel}${hov}${m.approx ? ' approx' : ''}${m.signed ? ' signed' : ''}${m.deal ? ' deal' : ''}" data-id="${m.id}" data-x="${px(m.lng).toFixed(1)}" data-y="${py(m.lat).toFixed(1)}" data-w="${w}" role="button" tabindex="0" aria-label="${esc(m.aria)}"><title>${esc(m.aria)}</title><circle class="mdot" r="4.6"/>${m.status ? `<circle class="sdot" cx="5.5" cy="-5.5" r="3"/>` : ''}${m.label ? `<g class="pill${m.est ? ' est' : ''}" visibility="hidden"><rect x="${(-w / 2).toFixed(0)}" y="-34" width="${w}" height="23" rx="11.5"/><text y="-17.5" text-anchor="middle" font-size="12.5">${esc(m.label)}</text></g>` : ''}</g>`;
    }
    // a small dark pill with light text: readable on imagery without a heavy outline
    const labelPill = (text, y, size = 11.5) => { const w = text.length * size * 0.58 + 14; return `<g class="lab"><rect x="${(-w / 2).toFixed(1)}" y="${y - 13}" width="${w.toFixed(1)}" height="18" rx="5"/><text y="${y}" text-anchor="middle" font-size="${size}">${esc(text)}</text></g>`; };
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
      for (const l of lvlEls) l.el.style.display = mode === 'sat' && k <= l.maxK ? '' : 'none';
      gateRoads(k);
      const shown = []; const clusterCells = new Map(); const cell = C.MAP.CLUSTER_CELL_PX; const clustering = !!C.MAP.CLUSTER && k >= C.MAP.CLUSTER_MIN_K && overlays.candidates;
      const bring = [];
      for (const m of order) {
        const el = markers.get(m.id); if (!el) continue;
        const X = +el.dataset.x, Y = +el.dataset.y, sx = (X - view.x) / k, sy = (Y - view.y) / k;
        el.setAttribute('transform', `translate(${X} ${Y}) scale(${k.toFixed(4)})`);
        const isSel = m.id === selected, isHaus = m.kind === 'haus';
        const visibleLayer = isHaus ? overlays.haus : m.signed ? overlays.signed : overlays.candidates;
        if (!visibleLayer) { el.style.display = 'none'; continue; }
        const onscreen = sx > -80 && sx < r.width + 80 && sy > -60 && sy < r.height + 60;
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
      let ch = '';
      if (clustering) for (const [, c] of clusterCells) { if (c.ids.length < 2) continue; const n = c.ids.length; for (const id of c.ids) { const el = markers.get(id); if (el) el.style.display = 'none'; } const X = c.X / n, Y = c.Y / n; const rad = Math.min(22, 12 + n); ch += `<g class="cluster" data-ids="${c.ids.join(',')}" transform="translate(${X.toFixed(1)} ${Y.toFixed(1)}) scale(${k.toFixed(4)})" role="button" tabindex="0" aria-label="${n} listings, zoom in"><circle r="${rad}"/><text text-anchor="middle" dy="4.5" font-size="12.5" font-weight="700">${n}</text></g>`; }
      layers.clusters.innerHTML = ch;
      for (const el of layers.clusters.querySelectorAll('.cluster')) el.addEventListener('click', (e) => { e.stopPropagation(); const t = el.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/); animateTo(zoomTarget(+t[1], +t[2], 2.2), 320); });
      for (const el of bring) layers.mks.appendChild(el);
      let o = '';
      if (anchor && overlays.rings) { const fx = px(anchor.lng), fy = py(anchor.lat); const mileDeg = 1 / (69.17 * Math.cos(anchor.lat * Math.PI / 180)); const pxMile = px(anchor.lng + mileDeg) - fx;
        for (const [mi, lab] of [[0.5, '10 min walk'], [1, '20 min walk'], [1.5, '30 min walk']]) { const rr = mi * pxMile; const w = 78 * k; o += `<circle class="ring" cx="${fx}" cy="${fy}" r="${rr.toFixed(0)}" stroke-width="${(1.2 * k).toFixed(1)}" stroke-dasharray="${(4 * k).toFixed(1)} ${(6 * k).toFixed(1)}"/><rect class="ring-b" x="${(fx - w / 2).toFixed(0)}" y="${(fy - rr - 17 * k).toFixed(0)}" width="${w.toFixed(0)}" height="${(16 * k).toFixed(0)}" rx="${(4 * k).toFixed(1)}"/><text class="ring-l" x="${fx}" y="${(fy - rr - 5.5 * k).toFixed(0)}" text-anchor="middle" font-size="${(10.5 * k).toFixed(1)}">${lab}</text>`; } }
      if (overlays.neighborhoods && neighborhoods) for (const [name, ll] of Object.entries(neighborhoods)) { const X = px(ll[1]), Y = py(ll[0]); o += `<g class="nb" transform="translate(${X.toFixed(0)} ${Y.toFixed(0)}) scale(${k.toFixed(4)})"><circle r="30" /><text text-anchor="middle" dy="4" font-size="11.5" font-weight="700">${esc(name)}</text></g>`; }
      layers.ovl.innerHTML = o;
      if (anchor) layers.anchor.innerHTML = `<g transform="translate(${px(anchor.lng).toFixed(1)} ${py(anchor.lat).toFixed(1)}) scale(${k.toFixed(4)})"><circle r="15" class="halo"/><rect class="dia" x="-8" y="-8" width="16" height="16" rx="3" transform="rotate(45)"/>${labelPill(anchor.name, -28)}</g>`; else layers.anchor.innerHTML = '';
    }
    // ---- vector streets and place names (OpenStreetMap), drawn the way Google's satellite view does:
    // yellow arterials, faint minor streets, white street names along the road with a soft dark halo,
    // uppercase neighbourhood names. Lines keep a constant screen width; text is rescaled per frame on the group.
    const LINE_MINZ = [9, 11, 12.5, 14, 15], LABEL_MINZ = [13, 13, 14, 15, 16];
    let lineGroups = [], labelMeta = [], placeMeta = [], textGroups = [], lastGate = null;
    // data = { marketId: { roads, places } }. Each market's geometry lives in its own group with a local origin,
    // because text-on-path layout breaks down when SVG coordinates run into the millions (float precision).
    function setRoads(data) {
      if (!data) return; let html = ''; const meta = [], pm = []; let i = 0;
      for (const [mid, m] of Object.entries(data)) {
        const first = m.roads?.[0]?.p?.[0] || (m.places?.[0] && [m.places[0].lng, m.places[0].lat]); if (!first) continue;
        const ox = Math.round(px(first[0])), oy = Math.round(py(first[1]));
        const lines = [[], [], [], [], []], texts = [], places = [];
        for (const w of m.roads || []) {
          let pts = w.p.map(([lng, lat]) => [px(lng), py(lat)]); if (pts[0][0] > pts[pts.length - 1][0]) pts = pts.reverse();
          let len = 0; for (let j = 1; j < pts.length; j++) len += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
          const d = pts.map((q, j) => `${j ? 'L' : 'M'}${(q[0] - ox).toFixed(1)} ${(q[1] - oy).toFixed(1)}`).join('');
          const id = `rd${i++}`; lines[w.c].push(`<path id="${id}" d="${d}"/>`);
          const textPx = w.n.length * 6.6 + 12; const fitZ = TZ - Math.log2(len / (textPx * 1.15));
          const minz = Math.max(LABEL_MINZ[w.c], Math.ceil(fitZ * 2) / 2); if (minz > 18.5) continue;
          const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
          meta.push({ minz, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), on: true });
          texts.push(`<text data-i="${meta.length - 1}"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(w.n)}</textPath></text>`);
        }
        for (const pl of m.places || []) { if (pl.k === 'city' || pl.k === 'town') continue; const X = px(pl.lng), Y = py(pl.lat); pm.push({ x: X, y: Y, on: true }); places.push(`<text class="pn" data-i="${pm.length - 1}" x="${(X - ox).toFixed(1)}" y="${(Y - oy).toFixed(1)}" text-anchor="middle">${esc(pl.n.toUpperCase())}</text>`); }
        html += `<g class="rg" data-m="${mid}" transform="translate(${ox} ${oy})">${lines.map((l, c) => `<g class="rl rc${c}" data-minz="${LINE_MINZ[c]}">${l.join('')}</g>`).join('')}<g class="rtx">${texts.join('')}</g><g class="pls">${places.join('')}</g></g>`;
      }
      layers.roads.innerHTML = html;
      for (const p of layers.roads.querySelectorAll('.rl path')) p.setAttribute('vector-effect', 'non-scaling-stroke');
      lineGroups = [...layers.roads.querySelectorAll('.rl')].map((g) => ({ el: g, minz: +g.dataset.minz }));
      textGroups = [...layers.roads.querySelectorAll('.rtx, .pls')];
      labelMeta = [...layers.roads.querySelectorAll('.rtx text')].map((el) => ({ ...meta[+el.dataset.i], el }));
      placeMeta = [...layers.roads.querySelectorAll('.pls text')].map((el) => ({ ...pm[+el.dataset.i], el }));
      lastGate = null; rescale();
    }
    // per frame: text size follows the zoom (group attributes only). On a zoom step or a real move: show only the
    // labels that fit this zoom and sit near the viewport, so the browser lays out a few hundred labels, not thousands.
    function gateRoads(k) {
      if (!lineGroups.length) return; const z = TZ - Math.log2(k); const step = Math.round(z * 4) / 4;
      for (const g of textGroups) { const pl = g.classList.contains('pls'); g.setAttribute('font-size', ((pl ? 11 : 11.5) * k).toFixed(2)); g.setAttribute('stroke-width', ((pl ? 3 : 2.6) * k).toFixed(2)); g.setAttribute('letter-spacing', ((pl ? 1.3 : 0.25) * k).toFixed(2)); }
      layers.roads.classList.toggle('z-hi', z >= 15.5);
      const moved = !lastGate || step !== lastGate.step || Math.abs(view.x - lastGate.x) > view.w * 0.25 || Math.abs(view.y - lastGate.y) > view.h * 0.25;
      if (!moved) return; lastGate = { step, x: view.x, y: view.y };
      for (const g of lineGroups) g.el.style.display = z >= g.minz ? '' : 'none';
      const X0 = view.x - view.w * 0.3, X1 = view.x + view.w * 1.3, Y0 = view.y - view.h * 0.3, Y1 = view.y + view.h * 1.3;
      for (const m of labelMeta) { const on = z >= m.minz && m.x1 > X0 && m.x0 < X1 && m.y1 > Y0 && m.y0 < Y1; if (on !== m.on) { m.on = on; m.el.style.display = on ? '' : 'none'; } }
      for (const m of placeMeta) { const on = z >= 13.5 && z < 17.5 && m.x > X0 && m.x < X1 && m.y > Y0 && m.y < Y1; if (on !== m.on) { m.on = on; m.el.style.display = on ? '' : 'none'; } }
    }
    svg.addEventListener('click', () => emit('select', null));
    let pending = null;   // camera request made while the map had no size (hidden tab, collapsed pane): replay it once we have one
    const ro = new ResizeObserver(() => { const r = rect(); if (pending && r.width > 0 && r.height > 0) { const p = pending; pending = null; p(); } else applyView(); }); ro.observe(svg);
    const whenSized = (fn) => { const r = rect(); if (r.width > 0 && r.height > 0) fn(); else pending = fn; };

    const api = {
      el: svg,
      on: (e, f) => ((listeners[e] ??= []).push(f), api),
      hasStreet: () => !!(T.street && T.street.length),
      setMode: (m) => { mode = m === 'map' && api.hasStreet() ? 'map' : 'sat'; layers.street.style.display = mode === 'map' ? '' : 'none'; layers.sat.style.display = mode === 'map' ? 'none' : ''; rescale(); return mode; },
      getMode: () => mode,
      setMarkers, rescale, setRoads,
      setSelected: (id) => { selected = id; for (const [mid, el] of markers) el.classList.toggle('sel', mid === id); rescale(); },
      setHover: (id) => { hovered = id; for (const [mid, el] of markers) el.classList.toggle('hov', mid === id); },
      setOverlay: (n, on) => { overlays[n] = on; rescale(); },
      getOverlays: () => ({ ...overlays }),
      zoomIn: () => animateTo(zoomTarget(view.x + view.w / 2, view.y + view.h / 2, 1.6)),
      zoomOut: () => animateTo(zoomTarget(view.x + view.w / 2, view.y + view.h / 2, 1 / 1.6)),
      flyTo: (lat, lng, z = 16) => whenSized(() => { const r = rect(); const a = r.height / Math.max(1, r.width); const w = widthForZoom(z); animateTo({ x: px(lng) - w / 2, y: py(lat) - w * a / 2, w, h: 0 }, C.MAP.FLY_MS, true); }),
      fitPoints: (pts, pad = 0.18) => whenSized(() => { const r = rect(); const a = r.height / Math.max(1, r.width); const xs = pts.map((p) => px(p.lng)), ys = pts.map((p) => py(p.lat)); if (!xs.length) return api.home(); let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); const w0 = Math.max(x1 - x0, (y1 - y0) / a) * (1 + pad * 2); const w = Math.max(widthForZoom(17), w0); animateTo({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w * a / 2, w, h: 0 }, C.MAP.FLY_MS, true); }),
      home: () => { const r = rect(); const a = r.width > 0 && r.height > 0 ? r.height / r.width : MH / MW; view = { x: 0, y: 0, w: Math.max(MW, MH / a), h: 0 }; applyView(); settled = { ...view }; },
      markSettled: () => { settled = { ...view }; },
      getBounds: () => ({ n: latOf(view.y), s: latOf(view.y + view.h), w: lngOf(view.x), e: lngOf(view.x + view.w) }),
      getView: () => ({ lat: latOf(view.y + view.h / 2), lng: lngOf(view.x + view.w / 2), z: zoomOf() }),
      getZoom: zoomOf,
      setAnchor: (a, nb) => { anchor = a || null; neighborhoods = nb || null; rescale(); },
      setView: (v) => whenSized(() => { const r = rect(); const a = r.height / Math.max(1, r.width); const w = widthForZoom(v.z ?? 12); view = { x: px(v.lng) - w / 2, y: py(v.lat) - w * a / 2, w, h: 0 }; applyView(); settled = { ...view }; }),
      resize: () => applyView(),
      destroy: () => { stopAnim(); ro.disconnect(); svg.remove(); },
    };
    api.home();
    return api;
  };
})();
