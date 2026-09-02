// Left panel: cohort + planning strip, search, filter chips with popovers, metrics, result cards, empty state.
(function () {
  const C = HFI.CONFIG, $ = HFI.$, $$ = HFI.$$, esc = HFI.esc, fm = HFI.fmtMoney;
  HFI.ui = HFI.ui || {};
  const S = HFI.state = HFI.state || { view: 'map', selected: null, hover: null, results: [], all: [], compare: false };

  HFI.ctx = () => { const f = HFI.filters; const cohort = HFI.cohorts.get(f.cohort); return { cohort, targetPrice: f.targetPrice, kitchenHard: f.kitchen, needBeds: cohort?.target_beds || 40, weights: C.WEIGHTS }; };
  HFI.compute = () => {
    const f = HFI.filters, ctx = HFI.ctx();
    const all = HFI.records().map((r) => { r.fit = HFI.hausFit(r, ctx); return r; });
    S.all = all;
    S.results = all.filter((r) => HFI.matches(r, f)).sort(HFI.sortFn(f.sort, f.room));
    return S.results;
  };
  // capacity a record contributes to planning
  HFI.bedsOf = (r) => r.beds_reserved ?? r.available_beds ?? r.beds ?? 0;
  HFI.planning = () => {
    const cohort = HFI.cohorts.get(HFI.filters.cohort); const need = cohort?.target_beds ?? null;
    const inCohort = (r) => !r.cohort_ids?.length || r.cohort_ids.includes(cohort?.id);
    const rows = S.all.filter((r) => r.market === HFI.filters.market && inCohort(r));
    const secured = rows.filter((r) => r.deal_status === 'signed').reduce((a, r) => a + HFI.bedsOf(r), 0);
    const negotiating = rows.filter((r) => HFI.ACTIVE_DEAL.has(r.deal_status)).reduce((a, r) => a + HFI.bedsOf(r), 0);
    return { cohort, need, secured, negotiating, gap: need == null ? null : Math.max(0, need - secured), signedRows: rows.filter((r) => r.deal_status === 'signed'), activeRows: rows.filter((r) => HFI.ACTIVE_DEAL.has(r.deal_status)) };
  };

  // ---- pieces ----
  const priceLine = (r, room) => {
    const p = HFI.priceFor(r, room);
    if (p == null) return `<span class="p unknown">Price unknown</span>`;
    const tag = r.price_kind === 'negotiated' ? 'negotiated' : r.price_kind === 'verified' ? `verified ${HFI.fmtDate(r.last_price_verified_at)}` : 'estimate';
    return `<span class="p ${r.price_kind}">${r.price_kind === 'estimate' ? '~' : ''}${fm(p)}<small>/bed</small></span><span class="ptag ${r.price_kind === 'estimate' ? '' : r.price_fresh.level}">${tag}</span>`;
  };
  const statusChip = (r) => { const m = HFI.statusMeta(r.deal_status); return `<span class="st ${m.tone}">${m.label}</span>`; };
  const kitchenChip = (r) => r.kitchen_ok ? `<span class="fx ok">Kitchen ✓</span>` : r.kitchen_status === 'none' ? `<span class="fx bad">NO KITCHEN</span>` : `<span class="fx">Kitchen ?</span>`;
  const safetyChip = (r) => ({ ok: '<span class="fx ok">Calm block</span>', mixed: '<span class="fx">Mixed block</span>', 'rough-block': '<span class="fx warn">Rough block</span>' }[r.safety_flag] || '<span class="fx">Safety: no signal</span>');
  const walkTxt = (r) => r.walk == null ? 'walk ?' : `${r.walk} min${r.walk_is_estimate ? ' est.' : ''}`;
  const bedsTxt = (r) => r.available_beds != null ? `${r.available_beds} avail` : r.beds != null ? `${r.beds} beds` : 'beds: ask';

  HFI.ui.card = (r) => {
    const f = HFI.filters; const fit = r.fit;
    const cfg = [r.private_rooms != null ? `${r.private_rooms} private` : null, r.shared_rooms != null ? `${r.shared_rooms} shared rooms` : null].filter(Boolean).join(' · ');
    const haus = (r.haus_node_ids || []).map((id) => HFI.nodes.get(id)?.name).filter(Boolean);
    return `<article class="card${S.selected === r.id ? ' sel' : ''}${r.dead ? ' dead' : ''}" data-id="${r.id}" tabindex="0" aria-label="${esc(r.property_name)}, ${r.price_per_bed != null ? fm(r.price_per_bed) + ' per bed' : 'price unknown'}, ${walkTxt(r)}, ${HFI.statusMeta(r.deal_status).label}">
      <div class="c-top"><div class="c-name">${esc(r.property_name)}${r.current_deal ? ' <span class="tag deal">current deal</span>' : ''}${r.geo_precision !== 'address' ? ' <span class="tag">approx. location</span>' : ''}</div>
        <button class="star${HFI.shortlist.has(r.id) ? ' on' : ''}" data-star="${r.id}" aria-label="Shortlist" title="Shortlist">${HFI.shortlist.has(r.id) ? '★' : '☆'}</button></div>
      <div class="c-sub">${esc(r.address || '')}${r.neighborhood ? ` · ${esc(r.neighborhood)}` : ''}</div>
      <div class="c-price">${priceLine(r, f.room)}<span class="fit" title="${esc(Object.entries(fit.parts).map(([k, p]) => `${k} ${p.pts}/${p.max}: ${p.note}`).join('\n'))}">Fit <b>${fit.score}</b></span></div>
      <div class="c-facts"><span>${bedsTxt(r)}</span><span>${walkTxt(r)}</span>${kitchenChip(r)}${safetyChip(r)}${statusChip(r)}</div>
      ${cfg ? `<div class="c-cfg">${cfg}</div>` : ''}
      <div class="c-meta">${r.available_beds != null ? `<span class="fr ${r.avail_fresh.level}">Availability ${HFI.ago(r.last_availability_verified_at) || 'unverified'}</span>` : ''}${r.last_contacted_at ? `<span class="fr ${r.contact_fresh.level}">Contacted ${HFI.ago(r.last_contacted_at)}</span>` : ''}${haus.length ? `<span class="fr haus">${haus.join(', ')}</span>` : ''}${r.attention.length ? `<span class="fr attn">⚑ ${esc(r.attention[0])}${r.attention.length > 1 ? ` +${r.attention.length - 1}` : ''}</span>` : ''}</div>
    </article>`;
  };

  HFI.ui.renderPlanning = () => {
    const p = HFI.planning(); const el = $('#planning'); if (!el) return;
    const need = p.need;
    el.innerHTML = `<div class="plan"><div class="pl"><span class="l">Cohort need</span><span class="n editable" title="planning estimate, click to edit"><input id="need-in" type="number" min="1" value="${need ?? ''}" placeholder="set" aria-label="Target beds"> beds</span></div>
      <div class="pl"><span class="l">Secured</span><span class="n good">${p.secured}</span></div>
      <div class="pl"><span class="l">Negotiating</span><span class="n warn">${p.negotiating}</span></div>
      <div class="pl"><span class="l">Gap</span><span class="n ${p.gap === 0 ? 'good' : 'bad'}">${p.gap ?? '?'}</span></div></div>
      <div class="plan-note">${p.cohort ? `${esc(p.cohort.target_residents_note || '')}${p.secured === 0 ? '. Nothing is signed in our data yet; the Fitzgerald is a verbal yes.' : ''}` : ''}</div>`;
    $('#need-in').addEventListener('change', (e) => { const v = +e.target.value || null; const c = HFI.cohorts.get(HFI.filters.cohort); if (c) { c.target_beds = v; c.target_residents = v; HFI.prefs.targetBeds = { ...(HFI.prefs.targetBeds || {}), [c.id]: v }; HFI.savePrefs(); } HFI.ui.renderAll(); });
  };

  HFI.ui.renderMetrics = () => {
    const rs = S.results.filter((r) => !r.dead); const beds = rs.reduce((a, r) => a + (r.available_beds ?? r.beds ?? 0), 0);
    const prices = rs.map((r) => HFI.priceFor(r, HFI.filters.room)).filter((v) => v != null); const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const walks = rs.map((r) => r.walk).filter((v) => v != null).sort((a, b) => a - b); const med = walks.length ? walks[Math.floor(walks.length / 2)] : null;
    const p = HFI.planning(); const attn = S.all.filter((r) => r.market === HFI.filters.market && r.attention.length).length;
    $('#metrics').innerHTML = [[S.results.length, 'matches', ''], [beds, 'beds', ''], [p.secured, 'secured', 'status:signed'], [avg != null ? fm(avg) : '–', 'avg/bed', ''], [med != null ? med + 'm' : '–', 'median walk', ''], [attn, 'follow-ups', 'attention']]
      .map(([n, l, act]) => `<button class="metric" ${act ? `data-act="${act}"` : 'disabled'}><span class="n">${n}</span><span class="l">${l}</span></button>`).join('');
    $$('#metrics [data-act]').forEach((b) => b.addEventListener('click', () => { const a = b.dataset.act; if (a === 'attention') HFI.filters.attention = !HFI.filters.attention; if (a === 'status:signed') HFI.filters.statuses = HFI.filters.statuses.includes('signed') ? [] : ['signed']; HFI.ui.renderAll(); }));
  };

  // ---- filter chips + popovers ----
  const POPS = {
    dates: (f) => `<label>Move in <input type="date" id="pf-from" value="${f.from || ''}"></label><label>Nights <input type="number" id="pf-nights" min="1" value="${f.nights ?? ''}"></label><div class="pop-hint">Cohort start fills this in; change it to test other windows.</div>`,
    beds: (f) => `<label>Minimum beds <input type="number" id="pf-minBeds" min="1" value="${f.minBeds ?? ''}" placeholder="any"></label><div class="pop-hint">Buildings can contribute part of the cohort; leave blank to see everything.</div>`,
    price: (f) => `<label>Max $/bed <input type="number" id="pf-maxBed" step="50" value="${f.maxBed ?? ''}" placeholder="any"></label><label>Target $/bed (for scoring) <input type="number" id="pf-target" step="50" value="${f.targetPrice}"></label><label class="row"><input type="checkbox" id="pf-verifiedOnly" ${f.verifiedOnly ? 'checked' : ''}> Verified or negotiated prices only</label>`,
    walk: (f) => `<label>Max walk to Frontier (min) <input type="number" id="pf-maxWalk" step="5" value="${f.maxWalk ?? ''}" placeholder="any"></label>`,
    kitchen: (f) => `<label class="row"><input type="checkbox" id="pf-kitchen" ${f.kitchen ? 'checked' : ''}> Kitchen required (hard constraint)</label><div class="pop-hint">Three months without a kitchen was the failure mode last time.</div>`,
    room: (f) => `<div class="seg"><button data-room="shared" aria-pressed="${f.room === 'shared'}">Shared ok</button><button data-room="private" aria-pressed="${f.room === 'private'}">Private only</button></div>`,
    status: (f) => `<div class="stack">${HFI.DEAL_STATUSES.map((s) => `<label class="row"><input type="checkbox" data-status="${s.id}" ${f.statuses.includes(s.id) ? 'checked' : ''}> ${s.label}</label>`).join('')}</div>`,
    more: (f) => `<label>Haus house <select id="pf-haus"><option value="">any</option>${[...HFI.nodes.values()].filter((n) => n.market === f.market).map((n) => `<option value="${n.id}" ${f.haus === n.id ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select></label>
      <div class="stack">${[['candidate', 'Candidates'], ['contracted_partner', 'Contracted partners'], ['rejected', 'Rejected'], ['archived', 'Archived']].map(([id, l]) => `<label class="row"><input type="checkbox" data-class="${id}" ${f.classes.includes(id) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <label class="row"><input type="checkbox" id="pf-shortlist" ${f.shortlist ? 'checked' : ''}> Shortlist only</label><label class="row"><input type="checkbox" id="pf-attention" ${f.attention ? 'checked' : ''}> Needs attention only</label>`,
  };
  let openPop = null;
  function closePop() { if (openPop) { openPop.remove(); openPop = null; } $$('.fchip[aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
  document.addEventListener('click', (e) => { if (openPop && !openPop.contains(e.target) && !e.target.closest('.fchip')) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  function openPopover(btn, key) {
    closePop(); const f = HFI.filters; const pop = document.createElement('div'); pop.className = 'pop'; pop.setAttribute('role', 'dialog'); pop.innerHTML = POPS[key](f) + `<div class="pop-actions"><button class="btn sm" data-apply>Apply</button></div>`;
    btn.parentElement.appendChild(pop); openPop = pop; btn.setAttribute('aria-expanded', 'true');
    const apply = () => { const g = (id) => pop.querySelector(id);
      if (key === 'dates') { f.from = g('#pf-from').value || null; f.nights = +g('#pf-nights').value || null; }
      if (key === 'beds') f.minBeds = g('#pf-minBeds').value === '' ? null : +g('#pf-minBeds').value;
      if (key === 'price') { f.maxBed = g('#pf-maxBed').value === '' ? null : +g('#pf-maxBed').value; f.targetPrice = +g('#pf-target').value || C.TARGET_PRICE_PER_BED; f.verifiedOnly = g('#pf-verifiedOnly').checked; }
      if (key === 'walk') f.maxWalk = g('#pf-maxWalk').value === '' ? null : +g('#pf-maxWalk').value;
      if (key === 'kitchen') f.kitchen = g('#pf-kitchen').checked;
      if (key === 'status') f.statuses = $$('[data-status]', pop).filter((c) => c.checked).map((c) => c.dataset.status);
      if (key === 'more') { f.haus = g('#pf-haus').value; f.classes = $$('[data-class]', pop).filter((c) => c.checked).map((c) => c.dataset.class); f.shortlist = g('#pf-shortlist').checked; f.attention = g('#pf-attention').checked; }
      closePop(); HFI.ui.renderAll(); };
    pop.querySelector('[data-apply]').addEventListener('click', apply);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') apply(); });
    $$('[data-room]', pop).forEach((b) => b.addEventListener('click', () => { f.room = b.dataset.room; closePop(); HFI.ui.renderAll(); }));
    const first = pop.querySelector('input,select,button'); if (first) first.focus();
  }
  HFI.ui.renderChips = () => {
    const f = HFI.filters;
    const chips = [['dates', f.from ? `${HFI.fmtDate(f.from)} · ${f.nights}n` : 'Dates'], ['beds', f.minBeds != null ? `${f.minBeds}+ beds` : 'Beds'], ['price', f.maxBed != null ? `≤ ${fm(f.maxBed, { short: true })}` : '$/bed'], ['walk', f.maxWalk != null ? `≤ ${f.maxWalk} min` : 'Walk'], ['kitchen', f.kitchen ? 'Kitchen ✓' : 'Kitchen'], ['room', f.room === 'private' ? 'Private' : 'Room'], ['status', f.statuses.length ? `${f.statuses.length} status` : 'Status'], ['more', 'More']];
    const active = (k) => ({ dates: !!f.from, beds: f.minBeds != null, price: f.maxBed != null || f.verifiedOnly, walk: f.maxWalk != null, kitchen: f.kitchen, room: f.room === 'private', status: f.statuses.length > 0, more: !!f.haus || f.shortlist || f.attention || f.classes.length !== 2 })[k];
    $('#chips').innerHTML = chips.map(([k, l]) => `<span class="fchip-wrap"><button class="fchip${active(k) ? ' on' : ''}" data-pop="${k}" aria-expanded="false" aria-haspopup="dialog">${l}<span class="car">▾</span></button></span>`).join('') + `<button class="fchip ghost" id="reset-filters">Reset</button>`;
    $$('[data-pop]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (openPop && b.getAttribute('aria-expanded') === 'true') closePop(); else openPopover(b, b.dataset.pop); }));
    $('#reset-filters').addEventListener('click', () => { const keep = { market: f.market, cohort: f.cohort }; HFI.filters = { ...HFI.defaultFilters(HFI.cohorts.get(f.cohort)), ...keep }; HFI.ui.renderAll(); });
    const act = HFI.activeChips(f);
    $('#summary').innerHTML = `<b>${S.results.length}</b> match${S.results.length === 1 ? '' : 'es'}${act.length ? ' · ' + act.map((a) => `<button class="mini" data-relax="${a.k}" title="remove this filter">${esc(a.label)} ×</button>`).join('') : ''}${act.length ? `<button class="mini ghost" id="clear-all">Clear all</button>` : ''}`;
    $$('[data-relax]').forEach((b) => b.addEventListener('click', () => { HFI.relaxFilter(f, b.dataset.relax); HFI.ui.renderAll(); }));
    const ca = $('#clear-all'); if (ca) ca.addEventListener('click', () => { const keep = { market: f.market, cohort: f.cohort }; HFI.filters = { ...HFI.defaultFilters(HFI.cohorts.get(f.cohort)), ...keep, from: null, maxBed: null, maxWalk: null, kitchen: false }; HFI.ui.renderAll(); });
  };

  HFI.ui.renderList = () => {
    const f = HFI.filters; const list = $('#list');
    $('#sort').value = f.sort;
    if (!S.results.length) {
      const act = HFI.activeChips(f).filter((a) => !['q'].includes(a.k));
      const sug = [];
      if (f.maxWalk != null && f.maxWalk < 30) sug.push(['maxWalk:30', `Relax walk to 30 min`]);
      if (f.maxBed != null && f.maxBed < 1500) sug.push(['maxBed:' + (f.maxBed + 300), `Increase budget to ${fm(f.maxBed + 300)}`]);
      if (f.kitchen) sug.push(['kitchen:0', 'Allow unknown kitchen']);
      if (f.minBeds != null) sug.push(['minBeds:', 'Allow partial availability (any bed count)']);
      if (f.area) sug.push(['area:', 'Search the whole city']);
      list.innerHTML = `<div class="empty"><h3>No housing matches all ${act.length} requirement${act.length === 1 ? '' : 's'}.</h3><ul>${act.map((a) => `<li>${esc(a.label)}</li>`).join('')}</ul>${sug.length ? `<div class="sug">${sug.map(([k, l]) => `<button class="btn sm" data-sug="${k}">${l}</button>`).join('')}</div>` : ''}</div>`;
      $$('[data-sug]', list).forEach((b) => b.addEventListener('click', () => { const [k, v] = b.dataset.sug.split(':'); f[k] = v === '' ? null : v === '0' ? false : +v; HFI.ui.renderAll(); }));
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

  HFI.ui.renderCohort = () => {
    const f = HFI.filters; const cohort = HFI.cohorts.get(f.cohort); const market = HFI.markets.get(f.market);
    $('#cohort-sel').innerHTML = [...HFI.cohorts.values()].map((c) => `<option value="${c.id}" ${c.id === f.cohort ? 'selected' : ''}>${esc(c.name)} · ${HFI.markets.get(c.market)?.name || c.market} · ${c.start_date_precision === 'day' ? HFI.fmtDate(c.start_date) + ' ' + c.start_date.slice(0, 4) : HFI.fmtDate(c.start_date)}</option>`).join('');
    $('#market-sel').innerHTML = [...HFI.markets.values()].map((m) => `<option value="${m.id}" ${m.id === f.market ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
    $('#ctx-line').innerHTML = cohort ? `<span class="ctx-big">${esc(cohort.name.toUpperCase())}</span><span class="ctx-sep"></span><span>Move-in <b>${HFI.fmtDate(cohort.start_date)}</b>${cohort.start_date_precision === 'day' ? '' : ' (month only)'}</span><span class="ctx-sep"></span><span>${esc(market?.name || '')}</span>` : '';
  };

  HFI.ui.renderAll = () => {
    HFI.compute();
    HFI.ui.renderCohort(); HFI.ui.renderPlanning(); HFI.ui.renderChips(); HFI.ui.renderMetrics();
    if (S.view === 'map') HFI.ui.renderList(); else HFI.views.render();
    HFI.ui.renderMarkers(); HFI.pushUrl();
  };

  HFI.ui.renderMarkers = () => {
    const f = HFI.filters; const ids = new Set(S.results.map((r) => r.id));
    const ms = [];
    for (const r of S.all) {
      if (r.market !== f.market || r.lat == null) continue;
      if (r.dead && !ids.has(r.id)) continue;                            // unavailable/rejected hidden unless filtered in
      const p = HFI.priceFor(r, f.room);
      ms.push({ id: r.id, kind: 'cand', lat: r.lat, lng: r.lng, label: p != null ? fm(p, { short: true }) : null, est: r.price_kind === 'estimate', dim: !ids.has(r.id), approx: r.geo_precision !== 'address',
        signed: r.deal_status === 'signed', deal: HFI.ACTIVE_DEAL.has(r.deal_status), status: r.deal_status !== 'not_contacted' && r.deal_status !== 'research', tone: HFI.statusMeta(r.deal_status).tone, priority: r.fit?.score || 0,
        aria: `${r.property_name}, ${p != null ? fm(p) + ' per bed' : 'price unknown'}, ${walkTxt(r)}, ${HFI.statusMeta(r.deal_status).label}` });
    }
    for (const n of HFI.nodes.values()) if (n.market === f.market && n.lat != null) ms.push({ id: 'node:' + n.id, kind: 'haus', lat: n.lat, lng: n.lng, label: n.name, approx: n.location_precision !== 'address', aria: `${n.name}, Haus residence, ${n.neighborhood || ''} ${n.location_precision === 'neighborhood' ? '(approximate location)' : ''}` });
    HFI.map.setMarkers(ms); HFI.map.setSelected(S.selected);
  };
})();
