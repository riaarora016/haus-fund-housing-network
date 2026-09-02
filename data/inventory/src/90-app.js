// Bootstrap: load data, URL and history state, market maps, header controls, prompt, views, mobile sheet.
(function () {
  const C = HFI.CONFIG, $ = HFI.$, $$ = HFI.$$; const S = HFI.state;
  HFI.ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L12 17l-5.4 3.1 1.2-6.1-4.5-4.2 6.1-.7z"/></svg>',
    caret: '<svg class="car" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
  };
  const VIEWS = ['pipeline', 'table', 'compare', 'haus'];
  let suppressUrl = false;
  HFI.pushUrl = (replace = true) => { if (suppressUrl) return; const v = HFI.map?.getView(); const p = HFI.toParams(HFI.filters, { view: S.view === 'map' ? null : S.view, sel: S.selected, c: v ? `${v.lat.toFixed(4)},${v.lng.toFixed(4)},${v.z}` : null }); const url = `${location.pathname}?${p}`; try { if (replace) history.replaceState({ sel: S.selected, view: S.view }, '', url); else history.pushState({ sel: S.selected, view: S.view }, '', url); } catch (e) { /* sandboxed viewers may refuse */ } };
  HFI.select = (id, opts = {}) => {
    const changed = S.selected !== id; S.selected = id;
    if (id && !id.startsWith('node:')) { const r = HFI.record(id); if (!r) return; if (opts.fly && r.lat != null && HFI.map) HFI.map.flyTo(r.lat, r.lng, Math.max(HFI.map.getZoom(), C.ZOOM.PROPERTY)); HFI.drawer.open(id); if (changed) HFI.pushUrl(false); }
    else if (id && id.startsWith('node:')) { const n = HFI.nodes.get(id.slice(5)); S.selected = null; HFI.setView('haus'); if (n?.lat != null && HFI.map) HFI.map.flyTo(n.lat, n.lng, C.ZOOM.HOUSE); }
    else { HFI.drawer.close(); if (changed) HFI.pushUrl(false); }
    if (HFI.map) HFI.map.setSelected(S.selected); $$('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
    if (id && S.view === 'map') { const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`); if (card && opts.scroll !== false) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  };
  HFI.hover = (id) => { S.hover = id; if (HFI.map) HFI.map.setHover(id); $$('.card').forEach((c) => c.classList.toggle('hov', c.dataset.id === id)); };
  HFI.setView = (v) => { S.view = VIEWS.includes(v) ? v : 'map'; $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === S.view))); const work = $('#work'); if (S.view === 'map') { work.hidden = true; document.body.classList.remove('view-work'); } else { work.hidden = false; document.body.classList.add('view-work'); $('#work-title').textContent = { pipeline: 'Pipeline', table: 'Table', compare: 'Compare shortlist', haus: 'Haus network' }[S.view]; HFI.views.render(); } HFI.pushUrl(false); };
  HFI.runPrompt = (text) => { $('#q').value = text; const { filters, read } = HFI.parsePrompt(text, { ...HFI.defaultFilters(), market: HFI.filters.market, sort: HFI.filters.sort, targetPrice: HFI.filters.targetPrice }); const marketChanged = filters.market !== HFI.filters.market; HFI.filters = filters; if (marketChanged) setMarket(filters.market, !S.results.length); HFI.ui.renderAll(); HFI.fitResults(); if (!read.length && text.trim()) HFI.toast('Could not read a requirement in that; try "40 beds, kitchen, under $1,000"'); };

  // frame the results near the anchor (within about 5 miles); far outliers do not drag the camera to the whole region
  HFI.fitResults = () => { if (!HFI.map || !S.results.length) return; const near = S.results.filter((r) => r.lat != null && !r.east_bay && (r.distance_miles == null || r.distance_miles <= 5)); const pts = near.length ? near : S.results.filter((r) => r.lat != null); if (pts.length) HFI.map.fitPoints(pts, 0.14); };
  function buildMap() {
    if (HFI.map) return;
    HFI.map = HFI.createMap($('#mapwrap'), HFI.TILES.world, {});
    HFI.map.on('select', (id) => HFI.select(id, { fly: false })).on('hover', (id) => HFI.hover(id))
      .on('moveend', ({ moved }) => { $('#search-area').classList.toggle('show', moved && !HFI.filters.area && HFI.hasIntent(HFI.filters)); if (!moved) HFI.pushUrl(); });
    $$('[data-ovl]').forEach((cb) => { cb.checked = HFI.map.getOverlays()[cb.dataset.ovl]; });
  }
  // a market is a place on the one world map: anchor, neighborhoods, and where the camera goes
  function setMarket(id, fly = true) {
    const market = HFI.markets.get(id); if (!market) return;
    $$('[data-market]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.market === id)));
    HFI.map.setAnchor(market.anchor, HFI.NEIGHBORHOODS[id]);
    if (fly && market.anchor) HFI.map.flyTo(market.anchor.lat, market.anchor.lng, C.ZOOM.MARKET);
  }
  function init() {
    HFI.load(HFI.DATA);
    const sp = new URLSearchParams(location.search);
    HFI.filters = HFI.fromParams(sp);
    S.view = VIEWS.includes(sp.get('view')) ? sp.get('view') : 'map';
    // markets with imagery become the toggle; the rest live in the Network view
    $('#markets').innerHTML = [...HFI.markets.values()].filter((m) => m.has_map).map((m) => `<button class="hbtn" data-market="${m.id}" aria-pressed="false">${HFI.esc(m.name)}</button>`).join('');
    $$('[data-market]').forEach((b) => b.addEventListener('click', () => { if (HFI.filters.market === b.dataset.market) return; HFI.filters = { ...HFI.defaultFilters(), market: b.dataset.market, sort: HFI.filters.sort }; $('#q').value = ''; S.selected = null; HFI.drawer.close(); setMarket(b.dataset.market); HFI.ui.renderAll(); }));
    buildMap(); setMarket(HFI.filters.market, false);
    $('#search-area').addEventListener('click', () => { HFI.filters.area = HFI.map.getBounds(); HFI.map.markSettled(); $('#search-area').classList.remove('show'); HFI.ui.renderAll(); });
    $('#zin').addEventListener('click', () => HFI.map?.zoomIn()); $('#zout').addEventListener('click', () => HFI.map?.zoomOut());
    $('#fit-inv').addEventListener('click', () => { if (!HFI.map) return; const pts = S.results.filter((r) => r.lat != null && !r.east_bay); if (pts.length) HFI.map.fitPoints(pts); else { const a = HFI.markets.get(HFI.filters.market)?.anchor; if (a) HFI.map.flyTo(a.lat, a.lng, C.ZOOM.MARKET); } });
    $('#panel-toggle').addEventListener('click', () => { const on = document.body.classList.toggle('panel-collapsed'); $('#panel-toggle').setAttribute('aria-expanded', String(!on)); $('#panel-toggle').setAttribute('aria-label', on ? 'Show the search panel' : 'Hide the search panel'); HFI.prefs.panelCollapsed = on; HFI.savePrefs(); });
    if (HFI.prefs.panelCollapsed) { document.body.classList.add('panel-collapsed'); $('#panel-toggle').setAttribute('aria-expanded', 'false'); }
        $('#legend-toggle').addEventListener('click', () => { const l = $('#legend'); l.classList.toggle('open'); $('#legend-toggle').setAttribute('aria-expanded', String(l.classList.contains('open'))); });
    $$('[data-ovl]').forEach((cb) => cb.addEventListener('change', () => HFI.map?.setOverlay(cb.dataset.ovl, cb.checked)));
    // header
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => HFI.setView(b.dataset.view === S.view && b.dataset.view !== 'map' ? 'map' : b.dataset.view)));
    $('#work-close').addEventListener('click', () => HFI.setView('map'));
    $('#attn-btn').addEventListener('click', () => { HFI.filters.attention = !HFI.filters.attention; HFI.ui.renderAll(); });
    $('#export-btn').addEventListener('click', () => HFI.views.openExport());
    $('#theme').addEventListener('click', () => { const r = document.documentElement; const cur = r.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); r.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark'); });
    // prompt
    $('#prompt-form').addEventListener('submit', (e) => { e.preventDefault(); HFI.runPrompt($('#q').value); });
    let qt = null; $('#q').addEventListener('input', () => { clearTimeout(qt); const v = $('#q').value; if (!v.trim()) { qt = setTimeout(() => { HFI.filters = { ...HFI.defaultFilters(), market: HFI.filters.market, sort: HFI.filters.sort }; HFI.ui.renderAll(); }, 250); return; } qt = setTimeout(() => HFI.runPrompt(v), 650); });
    $('#sort').innerHTML = HFI.SORTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    $('#sort').addEventListener('change', (e) => { HFI.filters.sort = e.target.value; HFI.ui.renderAll(); });
    $('#sheet-toggle').addEventListener('click', () => document.body.classList.toggle('sheet-full'));
    window.addEventListener('popstate', () => { const sp = new URLSearchParams(location.search); suppressUrl = true; const prevMarket = HFI.filters.market; HFI.filters = HFI.fromParams(sp); if (HFI.filters.market !== prevMarket) setMarket(HFI.filters.market, false); S.view = VIEWS.includes(sp.get('view')) ? sp.get('view') : 'map'; HFI.setView(S.view); HFI.ui.renderAll(); const sel = sp.get('sel'); if (sel && HFI.record(sel)) { S.selected = sel; HFI.drawer.open(sel); } else { S.selected = null; HFI.drawer.close(); } HFI.map?.setSelected(S.selected); suppressUrl = false; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (S.selected) HFI.select(null); else if (S.view !== 'map') HFI.setView('map'); } });
    // first render
    $('#q').value = HFI.filters.q;
    HFI.setView(S.view); HFI.ui.renderAll();
    const c = sp.get('c'); if (c && HFI.map) { const [lat, lng, z] = c.split(',').map(Number); if ([lat, lng, z].every(Number.isFinite)) HFI.map.setView({ lat, lng, z }); }
    else if (HFI.map && S.results.length) HFI.fitResults();
    else setMarket(HFI.filters.market, true);
    const sel = sp.get('sel'); if (sel && HFI.record(sel)) HFI.select(sel, { fly: !c });
  }
  window.addEventListener('DOMContentLoaded', init);
})();
