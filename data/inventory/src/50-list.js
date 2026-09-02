// Left panel: prompt, what the search means, filter chips with popovers, metrics, result cards, intro state.
(function () {
  const C = HFI.CONFIG, $ = HFI.$, $$ = HFI.$$, esc = HFI.esc, fm = HFI.fmtMoney;
  HFI.ui = HFI.ui || {};
  const S = HFI.state = HFI.state || { view: 'map', selected: null, hover: null, results: [], all: [] };

  HFI.ctx = () => {
    const f = HFI.filters; const haus = HFI.nodes.get(f.haus) || null; const p = haus?.profile;
    const needBeds = f.needBeds != null ? [f.needBeds, Math.round(f.needBeds * 1.3)] : p ? [p.beds_min, p.beds_max] : null;
    return { haus, weights: p?.weights || C.WEIGHTS, targetPrice: f.targetPrice, kitchenHard: f.kitchen || p?.kitchen === 'required', needBeds, from: f.from, market: f.market };
  };
  HFI.compute = () => {
    const f = HFI.filters, ctx = HFI.ctx();
    const all = HFI.records().map((r) => { r.fit = HFI.hausFit(r, ctx); return r; });
    S.all = all;
    S.results = HFI.hasIntent(f) ? all.filter((r) => HFI.matches(r, f)).sort(HFI.sortFn(f.sort, f.room)) : [];
    return S.results;
  };
  HFI.bedsOf = (r) => r.beds_reserved ?? r.available_beds ?? r.beds ?? 0;

  // ---- pieces ----
  const priceLine = (r, room) => {
    const p = HFI.priceFor(r, room);
    if (p == null) return `<span class="p unknown">Price unknown</span>`;
    const tag = r.price_kind === 'negotiated' ? 'negotiated' : r.price_kind === 'verified' ? `verified ${HFI.fmtDate(r.last_price_verified_at)}` : 'estimate';
    return `<span class="p ${r.price_kind}">${r.price_kind === 'estimate' ? '~' : ''}${fm(p)}<small>/bed</small></span><span class="ptag ${r.price_kind === 'estimate' ? '' : r.price_fresh.level}">${tag}</span>`;
  };
  const statusChip = (r) => { const m = HFI.statusMeta(r.deal_status); return `<span class="st ${m.tone}">${m.label}</span>`; };
  const kitchenChip = (r) => r.kitchen_ok ? `<span class="fx ok">Kitchen</span>` : r.kitchen_status === 'none' ? `<span class="fx bad">No kitchen</span>` : `<span class="fx">Kitchen unknown</span>`;
  const safetyChip = (r) => ({ ok: '<span class="fx ok">Calm block</span>', mixed: '<span class="fx">Mixed block</span>', 'rough-block': '<span class="fx warn">Rough block</span>' }[r.safety_flag] || '<span class="fx">Safety unknown</span>');
  const walkTxt = (r) => r.walk == null ? 'walk unknown' : `${r.walk} min${r.walk_is_estimate ? ' est.' : ''}`;
  const bedsTxt = (r) => r.available_beds != null ? `${r.available_beds} available` : r.beds != null ? `${r.beds} beds` : 'beds: ask';
  HFI.ui.walkTxt = walkTxt;

  HFI.ui.card = (r) => {
    const f = HFI.filters; const fit = r.fit;
    const cfg = [r.private_rooms != null ? `${r.private_rooms} private` : null, r.shared_rooms != null ? `${r.shared_rooms} shared rooms` : null].filter(Boolean).join(' · ');
    const tags = (r.haus_node_ids || []).map((id) => HFI.nodes.get(id)?.name).filter(Boolean);
    return `<article class="card${S.selected === r.id ? ' sel' : ''}${r.dead ? ' dead' : ''}" data-id="${r.id}" tabindex="0" aria-label="${esc(r.property_name)}, ${r.price_per_bed != null ? fm(r.price_per_bed) + ' per bed' : 'price unknown'}, ${walkTxt(r)}, ${HFI.statusMeta(r.deal_status).label}">
      <div class="c-top"><div class="c-name">${esc(r.property_name)}${r.current_deal ? ' <span class="tag deal">current deal</span>' : ''}${r.geo_precision !== 'address' ? ' <span class="tag">approx. location</span>' : ''}</div>
        <button class="star${HFI.shortlist.has(r.id) ? ' on' : ''}" data-star="${r.id}" aria-label="${HFI.shortlist.has(r.id) ? 'Remove from shortlist' : 'Add to shortlist'}" title="Shortlist">${HFI.ICON.star}</button></div>
      <div class="c-sub">${esc(r.address || '')}${r.neighborhood ? ` · ${esc(r.neighborhood)}` : ''}</div>
      <div class="c-price">${priceLine(r, f.room)}<span class="fit" title="${esc(Object.entries(fit.parts).map(([k, p]) => `${k} ${p.pts}/${p.max}: ${p.note}`).join('\n'))}">Fit <b>${fit.score}</b></span></div>
      <div class="c-facts"><span>${bedsTxt(r)}</span><span>${walkTxt(r)}</span>${kitchenChip(r)}${safetyChip(r)}${statusChip(r)}</div>
      ${cfg ? `<div class="c-cfg">${cfg}</div>` : ''}
      <div class="c-meta">${r.available_beds != null ? `<span class="fr ${r.avail_fresh.level}">Availability ${HFI.ago(r.last_availability_verified_at) || 'unverified'}</span>` : ''}${r.last_contacted_at ? `<span class="fr ${r.contact_fresh.level}">Contacted ${HFI.ago(r.last_contacted_at)}</span>` : ''}${tags.length ? `<span class="fr haus">${tags.join(', ')}</span>` : ''}${r.attention.length ? `<span class="fr attn">${esc(r.attention[0])}${r.attention.length > 1 ? ` +${r.attention.length - 1}` : ''}</span>` : ''}</div>
    </article>`;
  };

  HFI.ui.renderMetrics = () => {
    const el = $('#metrics'); if (!HFI.hasIntent(HFI.filters)) { el.innerHTML = ''; return; }
    const rs = S.results.filter((r) => !r.dead); const beds = rs.reduce((a, r) => a + (r.available_beds ?? r.beds ?? 0), 0);
    const prices = rs.map((r) => HFI.priceFor(r, HFI.filters.room)).filter((v) => v != null); const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const walks = rs.map((r) => r.walk).filter((v) => v != null).sort((a, b) => a - b); const med = walks.length ? walks[Math.floor(walks.length / 2)] : null;
    const talks = rs.filter((r) => HFI.ACTIVE_DEAL.has(r.deal_status)).length;
    el.innerHTML = [[S.results.length, 'matches'], [beds, 'beds'], [avg != null ? fm(avg) : '–', 'avg / bed'], [med != null ? med + ' min' : '–', 'median walk'], [talks, 'in talks']]
      .map(([n, l]) => `<div class="metric"><span class="n">${n}</span><span class="l">${l}</span></div>`).join('');
  };

  // ---- filter chips + popovers ----
  const POPS = {
    haus: (f) => `<div class="stack">${[...HFI.nodes.values()].filter((n) => n.market === f.market).map((n) => `<label class="row"><input type="radio" name="pf-haus" value="${n.id}" ${f.haus === n.id ? 'checked' : ''}> <b>${esc(n.name)}</b> <span class="unk">${n.profile.beds_min} to ${n.profile.beds_max} beds</span></label>`).join('')}<label class="row"><input type="radio" name="pf-haus" value="" ${!f.haus ? 'checked' : ''}> Any house</label></div><div class="pop-hint">Picking a house sets the bed range and the score weights to that house's profile.</div>`,
    beds: (f) => `<label>Beds needed <input type="number" id="pf-needBeds" min="1" value="${f.needBeds ?? ''}" placeholder="e.g. 40"></label><label>Minimum beds in one building <input type="number" id="pf-minBeds" min="1" value="${f.minBeds ?? ''}" placeholder="any"></label><div class="pop-hint">Buildings with about half the beds needed still show, as pair candidates.</div>`,
    price: (f) => `<label>Max $ per bed per month <input type="number" id="pf-maxBed" step="50" value="${f.maxBed ?? ''}" placeholder="any"></label><label>Target $ per bed (for scoring) <input type="number" id="pf-target" step="50" value="${f.targetPrice}"></label><label class="row"><input type="checkbox" id="pf-verifiedOnly" ${f.verifiedOnly ? 'checked' : ''}> Verified or negotiated prices only</label>`,
    walk: (f) => `<label>Max walk from ${esc(HFI.markets.get(f.market)?.anchor?.name || 'anchor')} (minutes) <input type="number" id="pf-maxWalk" step="5" value="${f.maxWalk ?? ''}" placeholder="any"></label>`,
    kitchen: (f) => `<label class="row"><input type="checkbox" id="pf-kitchen" ${f.kitchen ? 'checked' : ''}> Kitchen required</label><label class="row"><input type="checkbox" id="pf-safety" ${f.safety ? 'checked' : ''}> Calm or mixed block only (no rough blocks, no bad safety reviews)</label>`,
    room: (f) => `<div class="seg"><button data-room="shared" aria-pressed="${f.room === 'shared'}">Shared ok</button><button data-room="private" aria-pressed="${f.room === 'private'}">Private only</button></div>`,
    dates: (f) => `<label>Move in <input type="date" id="pf-from" value="${f.from || ''}"></label><label>Nights <input type="number" id="pf-nights" min="1" value="${f.nights ?? ''}" placeholder="any"></label><div class="pop-hint">Optional. With a date, timing joins the score and buildings not free by then drop out.</div>`,
    status: (f) => `<div class="stack">${HFI.DEAL_STATUSES.map((s) => `<label class="row"><input type="checkbox" data-status="${s.id}" ${f.statuses.includes(s.id) ? 'checked' : ''}> ${s.label}</label>`).join('')}</div>`,
    more: (f) => `<div class="stack">${[['candidate', 'Candidates'], ['contracted_partner', 'Contracted partners'], ['rejected', 'Rejected'], ['archived', 'Archived']].map(([id, l]) => `<label class="row"><input type="checkbox" data-class="${id}" ${f.classes.includes(id) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <label class="row"><input type="checkbox" id="pf-shortlist" ${f.shortlist ? 'checked' : ''}> Shortlist only</label><label class="row"><input type="checkbox" id="pf-attention" ${f.attention ? 'checked' : ''}> Needs attention only</label>`,
  };
  let openPop = null;
  function closePop() { if (openPop) { openPop.remove(); openPop = null; } $$('.fchip[aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
  document.addEventListener('click', (e) => { if (openPop && !openPop.contains(e.target) && !e.target.closest('.fchip')) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  function openPopover(btn, key) {
    closePop(); const f = HFI.filters; const pop = document.createElement('div'); pop.className = 'pop glass'; pop.setAttribute('role', 'dialog'); pop.innerHTML = POPS[key](f) + `<div class="pop-actions"><button class="btn sm primary" data-apply>Apply</button></div>`;
    btn.parentElement.appendChild(pop); openPop = pop; btn.setAttribute('aria-expanded', 'true');
    const apply = () => { const g = (id) => pop.querySelector(id);
      if (key === 'haus') { f.haus = pop.querySelector('input[name=pf-haus]:checked')?.value || ''; }
      if (key === 'dates') { f.from = g('#pf-from').value || null; f.nights = +g('#pf-nights').value || null; }
      if (key === 'beds') { f.needBeds = g('#pf-needBeds').value === '' ? null : +g('#pf-needBeds').value; f.minBeds = g('#pf-minBeds').value === '' ? null : +g('#pf-minBeds').value; }
      if (key === 'price') { f.maxBed = g('#pf-maxBed').value === '' ? null : +g('#pf-maxBed').value; f.targetPrice = +g('#pf-target').value || C.TARGET_PRICE_PER_BED; f.verifiedOnly = g('#pf-verifiedOnly').checked; }
      if (key === 'walk') f.maxWalk = g('#pf-maxWalk').value === '' ? null : +g('#pf-maxWalk').value;
      if (key === 'kitchen') { f.kitchen = g('#pf-kitchen').checked; f.safety = g('#pf-safety').checked; }
      if (key === 'status') f.statuses = $$('[data-status]', pop).filter((c) => c.checked).map((c) => c.dataset.status);
      if (key === 'more') { f.classes = $$('[data-class]', pop).filter((c) => c.checked).map((c) => c.dataset.class); f.shortlist = g('#pf-shortlist').checked; f.attention = g('#pf-attention').checked; }
      closePop(); HFI.ui.renderAll(); };
    pop.querySelector('[data-apply]').addEventListener('click', apply);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') apply(); });
    $$('[data-room]', pop).forEach((b) => b.addEventListener('click', () => { f.room = b.dataset.room; closePop(); HFI.ui.renderAll(); }));
    const first = pop.querySelector('input,select,button'); if (first) first.focus();
  }
  HFI.ui.renderChips = () => {
    const f = HFI.filters; const hausName = HFI.nodes.get(f.haus)?.name;
    const chips = [['haus', hausName || 'House'], ['beds', f.needBeds != null ? `${f.needBeds} beds` : f.minBeds != null ? `${f.minBeds}+ beds` : 'Beds'], ['price', f.maxBed != null ? `up to ${fm(f.maxBed, { short: true })}` : 'Price'], ['walk', f.maxWalk != null ? `${f.maxWalk} min` : 'Walk'], ['kitchen', f.kitchen && f.safety ? 'Kitchen, calm block' : f.kitchen ? 'Kitchen' : f.safety ? 'Calm block' : 'Kitchen, safety'], ['room', f.room === 'private' ? 'Private' : 'Room'], ['dates', f.from ? HFI.fmtDate(f.from) : 'Dates'], ['status', f.statuses.length ? `${f.statuses.length} status` : 'Status'], ['more', 'More']];
    const active = (k) => ({ haus: !!f.haus, beds: f.needBeds != null || f.minBeds != null, price: f.maxBed != null || f.verifiedOnly, walk: f.maxWalk != null, kitchen: f.kitchen || f.safety, room: f.room === 'private', dates: !!f.from, status: f.statuses.length > 0, more: f.shortlist || f.attention || f.classes.length !== 2 })[k];
    $('#chips').innerHTML = chips.map(([k, l]) => `<span class="fchip-wrap"><button class="fchip${active(k) ? ' on' : ''}" data-pop="${k}" aria-expanded="false" aria-haspopup="dialog">${esc(l)}${HFI.ICON.caret}</button></span>`).join('');
    $$('[data-pop]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (openPop && b.getAttribute('aria-expanded') === 'true') closePop(); else openPopover(b, b.dataset.pop); }));
    const act = HFI.activeChips(f); const rd = $('#reading');
    rd.innerHTML = act.length ? `<span class="rd-l">Showing</span>${act.map((a) => `<button class="mini" data-relax="${a.k}" title="Remove">${esc(a.label)} <span aria-hidden="true">×</span></button>`).join('')}<button class="mini ghost" id="clear-all">Clear</button>` : '';
    $$('[data-relax]').forEach((b) => b.addEventListener('click', () => { HFI.relaxFilter(f, b.dataset.relax); HFI.ui.renderAll(); }));
    const ca = $('#clear-all'); if (ca) ca.addEventListener('click', () => { HFI.filters = { ...HFI.defaultFilters(), market: f.market }; $('#q').value = ''; HFI.ui.renderAll(); });
  };

  const EXAMPLES = { sf: ['40 beds with a kitchen under $1,000 per bed', 'Femhaus: 12 beds, calm block, kitchen', 'Alumhaus, private rooms, near Frontier', 'Nob Hill, verified prices', 'Not contacted yet, 20+ beds'], kobe: ['Cellhaus: 15 beds near KBIC', '12 beds with a kitchen on Port Island'] };
  HFI.ui.renderIntro = () => {
    const f = HFI.filters; const market = HFI.markets.get(f.market); const n = S.all.filter((r) => r.market === f.market && !r.dead).length;
    const nodes = [...HFI.nodes.values()].filter((x) => x.market === f.market);
    $('#list').innerHTML = `<div class="intro">
      <div class="intro-eyebrow">${esc(market?.name || '')}</div>
      <h2 class="intro-h">What do you need?</h2>
      <p class="intro-p">${n ? `${n} buildings on file. Describe the housing in plain words, or pick a house below. Nothing is drawn on the map until you ask.` : 'No buildings logged for this market yet. Pick a house to see its profile, or add candidates through additions.json.'}</p>
      ${nodes.length ? `<div class="intro-l">Houses</div><div class="hpick">${nodes.map((x) => `<button class="hbtn-card" data-pick-haus="${x.id}"><span class="hdiamond"></span><span><b>${esc(x.name)}</b><small>${x.profile.beds_min} to ${x.profile.beds_max} beds · ${esc(x.status_label)}</small></span></button>`).join('')}</div>` : ''}
      <div class="intro-l">Try</div><div class="sug">${(EXAMPLES[f.market] || []).map((t) => `<button class="mini" data-prompt="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    </div>`;
    $$('[data-pick-haus]').forEach((b) => b.addEventListener('click', () => { HFI.filters.haus = b.dataset.pickHaus; HFI.ui.renderAll(); }));
    $$('[data-prompt]').forEach((b) => b.addEventListener('click', () => HFI.runPrompt(b.dataset.prompt)));
  };

  HFI.ui.renderList = () => {
    const f = HFI.filters; const list = $('#list');
    $('#sort').value = f.sort;
    document.body.classList.toggle('has-results', HFI.hasIntent(f));
    if (!HFI.hasIntent(f)) return HFI.ui.renderIntro();
    $('#count').textContent = `${S.results.length} match${S.results.length === 1 ? '' : 'es'}`;
    if (!S.results.length) {
      const act = HFI.activeChips(f);
      const sug = [];
      if (f.maxWalk != null && f.maxWalk < 30) sug.push(['maxWalk:30', 'Allow a 30 min walk']);
      if (f.maxBed != null && f.maxBed < 1500) sug.push(['maxBed:' + (f.maxBed + 300), `Raise the budget to ${fm(f.maxBed + 300)}`]);
      if (f.kitchen) sug.push(['kitchen:0', 'Allow unknown kitchen']);
      if (f.safety) sug.push(['safety:0', 'Allow mixed blocks']);
      if (f.minBeds != null || f.needBeds != null) sug.push(['minBeds:', 'Allow smaller buildings']);
      if (f.area) sug.push(['area:', 'Search the whole city']);
      if (f.q) sug.push(['q:', `Drop "${f.q}"`]);
      list.innerHTML = `<div class="empty"><h3>Nothing matches all ${act.length} requirement${act.length === 1 ? '' : 's'}.</h3><ul>${act.map((a) => `<li>${esc(a.label)}</li>`).join('')}</ul>${sug.length ? `<div class="sug">${sug.map(([k, l]) => `<button class="btn sm" data-sug="${k}">${l}</button>`).join('')}</div>` : ''}</div>`;
      $$('[data-sug]', list).forEach((b) => b.addEventListener('click', () => { const [k, v] = b.dataset.sug.split(':'); if (k === 'minBeds') { f.minBeds = null; f.needBeds = null; } else f[k] = v === '' ? null : v === '0' ? false : +v; HFI.ui.renderAll(); }));
      return;
    }
    list.innerHTML = S.results.map(HFI.ui.card).join('');
    $$('.card', list).forEach((el) => {
      const id = el.dataset.id;
      el.addEventListener('click', (e) => { if (e.target.closest('[data-star]')) return; HFI.select(id, { fly: true }); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') HFI.select(id, { fly: true }); });
      el.addEventListener('mouseenter', () => HFI.hover(id)); el.addEventListener('mouseleave', () => HFI.hover(null));
    });
    $$('[data-star]', list).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); HFI.toggleShortlist(b.dataset.star); HFI.ui.renderAll(); }));
  };

  HFI.ui.renderAll = () => {
    HFI.compute();
    HFI.ui.renderChips(); HFI.ui.renderMetrics();
    HFI.ui.renderList(); if (S.view !== 'map') HFI.views.render();
    HFI.ui.renderMarkers(); HFI.pushUrl();
  };

  HFI.ui.renderMarkers = () => {
    const f = HFI.filters; if (!HFI.map) return;
    const ms = [];
    if (HFI.hasIntent(f)) for (const r of S.results) {
      if (r.lat == null) continue;
      const p = HFI.priceFor(r, f.room);
      ms.push({ id: r.id, kind: 'cand', lat: r.lat, lng: r.lng, label: p != null ? fm(p, { short: true }) : null, est: r.price_kind === 'estimate', dim: false, approx: r.geo_precision !== 'address',
        signed: r.deal_status === 'signed', deal: HFI.ACTIVE_DEAL.has(r.deal_status), status: r.deal_status !== 'not_contacted' && r.deal_status !== 'research', tone: HFI.statusMeta(r.deal_status).tone, priority: r.fit?.score || 0,
        aria: `${r.property_name}, ${p != null ? fm(p) + ' per bed' : 'price unknown'}, ${walkTxt(r)}, ${HFI.statusMeta(r.deal_status).label}` });
    }
    for (const n of HFI.nodes.values()) if (n.market === f.market && n.lat != null) ms.push({ id: 'node:' + n.id, kind: 'haus', lat: n.lat, lng: n.lng, label: n.name, approx: n.location_precision !== 'address', aria: `${n.name}, Haus residence, ${n.neighborhood || ''} ${n.location_precision !== 'address' ? '(approximate location)' : ''}` });
    HFI.map.setMarkers(ms); HFI.map.setSelected(S.selected);
  };
})();
