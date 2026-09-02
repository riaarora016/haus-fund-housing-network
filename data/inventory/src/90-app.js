// Bootstrap: load data, URL/history state, map wiring, header controls, mobile sheet.
(function () {
  const C = HFI.CONFIG, $ = HFI.$, $$ = HFI.$$; const S = HFI.state;
  let suppressUrl = false;
  HFI.pushUrl = (replace = true) => { if (suppressUrl) return; const v = HFI.map?.getView(); const p = HFI.toParams(HFI.filters, { view: S.view === 'map' ? null : S.view, sel: S.selected, c: v ? `${v.lat.toFixed(4)},${v.lng.toFixed(4)},${v.z}` : null }); const url = `${location.pathname}?${p}`; if (replace) history.replaceState({ sel: S.selected, view: S.view }, '', url); else history.pushState({ sel: S.selected, view: S.view }, '', url); };
  HFI.select = (id, opts = {}) => {
    const changed = S.selected !== id; S.selected = id;
    if (id && !id.startsWith('node:')) { const r = HFI.record(id); if (!r) return; if (opts.fly && r.lat != null) HFI.map.flyTo(r.lat, r.lng, 8); HFI.drawer.open(id); if (changed) HFI.pushUrl(false); }
    else if (id && id.startsWith('node:')) { const n = HFI.nodes.get(id.slice(5)); S.view = 'haus'; HFI.ui.renderAll(); if (n?.lat != null) HFI.map.flyTo(n.lat, n.lng, 6); }
    else { HFI.drawer.close(); if (changed) HFI.pushUrl(false); }
    HFI.map.setSelected(S.selected); $$('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
    if (id && S.view === 'map') { const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`); if (card && opts.scroll !== false) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  };
  HFI.hover = (id) => { S.hover = id; HFI.map.setHover(id); $$('.card').forEach((c) => c.classList.toggle('hov', c.dataset.id === id)); };

  function init() {
    HFI.load(HFI.DATA);
    // planning overrides saved in this browser
    for (const [cid, v] of Object.entries(HFI.prefs.targetBeds || {})) { const c = HFI.cohorts.get(cid); if (c && v) { c.target_beds = v; c.target_residents = v; } }
    const sp = new URLSearchParams(location.search);
    HFI.filters = HFI.fromParams(sp);
    S.view = ['pipeline', 'table', 'compare', 'haus'].includes(sp.get('view')) ? sp.get('view') : 'map';
    const market = HFI.markets.get(HFI.filters.market) || HFI.markets.get(C.DEFAULT_MARKET);
    HFI.map = HFI.createMap($('#mapwrap'), HFI.TILES, { anchor: market.anchor, neighborhoods: HFI.NEIGHBORHOODS });
    HFI.map.on('select', (id) => HFI.select(id, { fly: false })).on('hover', (id) => HFI.hover(id))
      .on('moveend', ({ moved }) => { $('#search-area').classList.toggle('show', moved && !HFI.filters.area); if (!moved) HFI.pushUrl(); });
    $('#search-area').addEventListener('click', () => { HFI.filters.area = HFI.map.getBounds(); HFI.map.markSettled(); $('#search-area').classList.remove('show'); HFI.ui.renderAll(); });
    // map controls
    $('#zin').addEventListener('click', () => HFI.map.zoomIn()); $('#zout').addEventListener('click', () => HFI.map.zoomOut());
    $('#fit-inv').addEventListener('click', () => { const pts = S.results.filter((r) => r.lat != null && !r.east_bay); HFI.map.fitPoints(pts.length ? pts : S.all.filter((r) => r.lat != null && !r.east_bay)); });
    $('#go-frontier').addEventListener('click', () => { const a = market.anchor; if (a) HFI.map.flyTo(a.lat, a.lng, 6); });
    $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { HFI.map.setMode(b.dataset.mode); $$('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b)); HFI.prefs.mode = b.dataset.mode; HFI.savePrefs(); }));
    if (HFI.prefs.mode === 'map') { HFI.map.setMode('map'); $$('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.mode === 'map')); }
    $('#legend-toggle').addEventListener('click', () => $('#legend').classList.toggle('open'));
    $$('[data-ovl]').forEach((cb) => { cb.checked = HFI.map.getOverlays()[cb.dataset.ovl]; cb.addEventListener('change', () => HFI.map.setOverlay(cb.dataset.ovl, cb.checked)); });
    // header
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.view; $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.view === S.view)); HFI.ui.renderAll(); HFI.pushUrl(false); }));
    $('#attn-btn').addEventListener('click', () => { HFI.filters.attention = !HFI.filters.attention; HFI.ui.renderAll(); });
    $('#export-btn').addEventListener('click', () => HFI.views.openExport());
    $('#theme').addEventListener('click', () => { const r = document.documentElement; const cur = r.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); r.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark'); });
    $('#cohort-sel').addEventListener('change', (e) => { const c = HFI.cohorts.get(e.target.value); HFI.filters.cohort = c.id; HFI.filters.market = c.market; HFI.filters.from = c.start_date_precision === 'day' ? c.start_date : null; HFI.ui.renderAll(); });
    $('#market-sel').addEventListener('change', (e) => { HFI.filters.market = e.target.value; HFI.ui.renderAll(); });
    $('#q').addEventListener('input', (e) => { HFI.filters.q = e.target.value.trim(); HFI.ui.renderAll(); });
    $('#sort').innerHTML = HFI.SORTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    $('#sort').addEventListener('change', (e) => { HFI.filters.sort = e.target.value; HFI.ui.renderAll(); });
    // mobile sheet
    $('#sheet-toggle').addEventListener('click', () => { const b = document.body; b.classList.toggle('sheet-full'); });
    window.addEventListener('popstate', (e) => { const sp = new URLSearchParams(location.search); suppressUrl = true; HFI.filters = HFI.fromParams(sp); S.view = ['pipeline', 'table', 'compare', 'haus'].includes(sp.get('view')) ? sp.get('view') : 'map'; $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.view === S.view)); HFI.ui.renderAll(); const sel = sp.get('sel'); if (sel && HFI.record(sel)) { S.selected = sel; HFI.drawer.open(sel); } else { S.selected = null; HFI.drawer.close(); } HFI.map.setSelected(S.selected); suppressUrl = false; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.selected) HFI.select(null); });
    // first render
    $('#q').value = HFI.filters.q; $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.view === S.view));
    $('#data-date').textContent = HFI.DATA.generated;
    HFI.ui.renderAll();
    const c = sp.get('c'); if (c) { const [lat, lng, z] = c.split(',').map(Number); if ([lat, lng, z].every(Number.isFinite)) HFI.map.setView({ lat, lng, z }); }
    else { const pts = S.results.filter((r) => r.lat != null && !r.east_bay); if (pts.length) HFI.map.fitPoints(pts, 0.12); }
    const sel = sp.get('sel'); if (sel && HFI.record(sel)) HFI.select(sel, { fly: !c });
  }
  window.addEventListener('DOMContentLoaded', init);
})();
