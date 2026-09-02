// Property detail drawer: economics, capacity, facilities, location, operations, contact, deal, timeline, source. Edit mode + quick actions.
(function () {
  const $ = HFI.$, $$ = HFI.$$, esc = HFI.esc, fm = HFI.fmtMoney; const S = HFI.state;
  const val = (v, unit = '') => v == null || v === '' ? '<span class="unk">unknown</span>' : `${esc(v)}${unit}`;
  const money = (v) => v == null ? '<span class="unk">unknown</span>' : fm(v);
  const fresh = (iso, kind) => { const f = HFI.freshness(iso, kind); return `<span class="fr ${f.level}">${f.label}</span>`; };
  const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const sec = (title, body, extra = '') => `<section class="dsec"><h4>${title}${extra}</h4>${body}</section>`;

  HFI.drawer = {
    open(id) {
      const r = HFI.record(id); if (!r) return; const f = HFI.filters; const fit = r.fit || HFI.hausFit(r, HFI.ctx()); const anchorName = HFI.markets.get(r.market)?.anchor?.name || 'the anchor';
      const d = $('#drawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open');
      const tags = (r.haus_node_ids || []).map((n) => HFI.nodes.get(n)?.name).filter(Boolean);
      const tl = HFI.timeline(r);
      const contactLine = [r.contact_phone ? `<a class="btn sm" href="tel:${r.contact_phone.replace(/[^\d+]/g, '').slice(0, 12)}">Call</a>` : '', r.contact_email ? `<a class="btn sm" href="mailto:${r.contact_email}?subject=${encodeURIComponent(`Housing for Haus founders${f.from ? ' from ' + HFI.fmtDate(f.from) : ''}`)}">Email</a>` : '', r.website_url ? `<a class="btn sm" href="${esc(r.website_url)}" target="_blank" rel="noopener">Website ↗</a>` : ''].join('');
      const monthlyTotal = r.negotiated_monthly ?? (r.price_per_bed != null && r.beds != null ? r.price_per_bed * r.beds : null);
      d.innerHTML = `
      <div class="d-head"><button class="x" id="d-close" aria-label="Close">×</button>
        <div class="d-title"><h3>${esc(r.property_name)}</h3>${r.name_detail ? `<div class="d-detail">${esc(r.name_detail)}</div>` : ''}<div class="d-sub">${esc(r.address || '')}${r.neighborhood ? ` · ${esc(r.neighborhood)}` : ''}${r.geo_precision !== 'address' ? ' · <span class="tag">approx. location</span>' : ''}</div></div>
        <div class="d-status"><span class="st ${HFI.statusMeta(r.deal_status).tone}">${HFI.statusMeta(r.deal_status).label}</span><span class="fit big">Fit <b>${fit.score}</b>/100</span>${r.current_deal ? '<span class="tag deal">current deal</span>' : ''}${tags.map((h) => `<span class="tag haus">${esc(h)}</span>`).join('')}</div>
        <div class="d-actions">${contactLine}<button class="btn sm" data-act="copy-outreach">Copy outreach</button><button class="btn sm" data-act="contacted">Mark contacted</button><button class="btn sm" data-act="note">Add note</button><button class="btn sm" data-act="followup">Set follow-up</button><button class="btn sm${HFI.shortlist.has(r.id) ? ' on' : ''}" data-act="star">${HFI.shortlist.has(r.id) ? 'Shortlisted' : 'Shortlist'}</button><button class="btn sm primary" data-act="edit">Edit</button></div>
      </div>
      <div class="d-body">
        ${sec('Haus fit', `<div class="fitgrid">${Object.entries(fit.parts).map(([k, p]) => `<div class="fp"><span class="k">${k}</span><span class="v">${p.pts}<small>/${p.max}</small></span><span class="n">${esc(p.note)}</span></div>`).join('')}</div>${fit.excluded ? `<div class="warn-box">Excluded by current filters: ${fit.reasons.join(', ')}</div>` : ''}`)}
        ${sec('Economics', kv([
          ['Asking', r.asking_per_bed != null ? `~${fm(r.asking_per_bed)}/bed${r.asking_per_room_low != null ? ` · rooms ${fm(r.asking_per_room_low)}${r.asking_per_room_high && r.asking_per_room_high !== r.asking_per_room_low ? ` to ${fm(r.asking_per_room_high)}` : ''}` : ''}${r.asking_raw ? ` <span class="unk">(${esc(r.asking_raw)})</span>` : ''}` : val(null)],
          ['Verified price', r.verified_per_bed != null ? `${fm(r.verified_per_bed)}/bed ${fresh(r.last_price_verified_at, 'price')}${r.verified_private_room != null ? ` · private ${fm(r.verified_private_room)}` : ''}` : '<span class="unk">not verified</span>'],
          ['Negotiated', r.negotiated_per_bed != null ? `${fm(r.negotiated_per_bed)}/bed` : val(null)], ['Total monthly', monthlyTotal != null ? `${fm(monthlyTotal)}${r.negotiated_monthly == null ? ' <span class="unk">(price × beds, estimate)</span>' : ''}` : val(null)],
          ['Deposit / fees / utilities', `${money(r.deposit)} / ${money(r.other_fees)} / ${money(r.utilities_monthly)}`], ['Resident rate / subsidy', '<span class="unk">not configured</span>']])
        )}
        ${sec('Capacity', kv([['Rooms', val(r.total_rooms)], ['Beds', r.beds != null ? `${r.beds}${r.occupancy_assumption ? ` <span class="unk">(${r.occupancy_assumption} per room assumed)</span>` : ''}` : val(null)], ['Available now', r.available_beds != null ? `${r.available_beds} ${fresh(r.last_availability_verified_at, 'availability')}` : '<span class="unk">ask, never estimated</span>'], ['Private / shared rooms', `${val(r.private_rooms)} / ${val(r.shared_rooms)}`], ['Min / max block', `${val(r.minimum_block)} / ${val(r.maximum_block)}`], ['As tracked', val(r.capacity_raw)]]))}
        ${sec('Facilities', kv([['Kitchen', r.kitchen_ok ? `<span class="fx ok">${r.kitchen_status}</span>` : r.kitchen_status === 'none' ? '<span class="fx bad">NO KITCHEN</span>' : val(null)], ['Common space', val(r.common_space)], ['Furnished', val(typeof r.furnished === 'boolean' ? (r.furnished ? 'yes' : 'no') : null)], ['Bathrooms', val(r.bath === 'unknown' ? null : r.bath)], ['Laundry / workspace / accessibility', `${val(r.laundry)} / ${val(r.workspace)} / <span class="unk">unknown</span>`]]))}
        ${sec('Location', kv([[`Walk to ${esc(anchorName)}`, r.walk != null ? `${r.walk} min${r.walk_is_estimate ? ' <span class="unk">(est. from distance)</span>' : ` <span class="unk">(${esc(r.walk_source || 'tracker')})</span>`}` : val(null)], ['Straight-line', r.distance_miles != null ? `${r.distance_miles} mi` : val(null)], ['Neighborhood', `${val(r.neighborhood)}${r.priority_neighborhood ? ' <span class="tag ok">preferred</span>' : ''}${r.east_bay ? ' <span class="tag warn">East Bay</span>' : ''}`], ['Safety signal', `${({ ok: 'calm block', mixed: 'mixed block', 'rough-block': 'rough block' }[r.safety_flag] || 'no signal')}${r.review_rating ? ` · reviews: ${esc(r.review_rating)}` : ''}${r.safety_note ? `<div class="unk">${esc(r.safety_note)}</div>` : ''}<div class="unk">source: ${esc(r.safety_source)}</div>`]]))}
        ${sec('Operations', kv([['Available from', r.available_from ? HFI.fmtDate(r.available_from) : r.sept15_ready === true ? 'ready for arrival day (tracker)' : r.sept15_ready === false ? 'not ready for arrival day' : val(null)], ['Min / max stay', `${r.minimum_stay_days != null ? r.minimum_stay_days + ' nights' : val(null)} / ${val(r.maximum_stay_days)}`], ['Timing', fit.parts.timing ? esc(fit.parts.timing.note) : '<span class="unk">add a move-in date to the search to score timing</span>'], ['Bookable online', r.bookable_online ? 'yes' : 'no'], ['Walk-in ready', val(r.walk_in_ready === 'unknown' ? null : r.walk_in_ready)]]))}
        ${sec('Contact', kv([['Operator', `${val(r.operator_name || r.contact_org)} <span class="unk">(${esc(r.operator_type)})</span>`], ['Person', `${val(r.contact_name)}${r.contact_verify ? ' <span class="tag warn">verify number</span>' : ''}`], ['Phone', r.contact_phone ? `<a href="tel:${r.contact_phone.replace(/[^\d+]/g, '').slice(0, 12)}">${esc(r.contact_phone)}</a>` : val(null)], ['Email', r.contact_email ? `<a href="mailto:${r.contact_email}">${esc(r.contact_email)}</a>` : val(null)], ['Path', val(r.contact_path)], ['Website', r.website_url ? `<a href="${esc(r.website_url)}" target="_blank" rel="noopener">${esc(r.website_url.replace(/^https?:\/\//, '').slice(0, 48))}</a>` : val(null)]]))}
        ${sec('Deal', kv([['Status', HFI.statusMeta(r.deal_status).label], ['Owner', val(r.assigned_owner)], ['Next action', val(r.next_action)], ['Follow-up', r.next_followup_at ? `${HFI.fmtDate(r.next_followup_at)}${r.next_followup_at <= HFI.today() ? ' <span class="tag warn">overdue</span>' : ''}` : val(null)], ['Last contacted', r.last_contacted_at ? `${HFI.fmtDate(r.last_contacted_at)} ${fresh(r.last_contacted_at, 'contact')}` : val(null)], ['Followed up by', `${val(r.followed_up_by)}${r.call_phone ? ` · from ${esc(r.call_phone)}` : ''}`], ['Call notes', val(r.call_notes)], ['Quoted terms', val(r.quoted_terms)], ['House', `${r.haus_node_ids?.length ? r.haus_node_ids.map((c) => HFI.nodes.get(c)?.name || c).join(', ') : '<span class="unk">no house yet</span>'} · use: ${val(r.use)} · beds reserved: ${val(r.beds_reserved)}`], ['The play', val(r.play)]]))}
        ${sec('Activity', tl.length ? `<ol class="tl">${tl.slice(0, 40).map((t) => `<li class="${t.kind}"><span class="t-at">${HFI.fmtDate(t.at) || ''}</span><span class="t-by">${esc(t.by)}</span><span class="t-tx">${esc(t.text)}</span></li>`).join('')}</ol>` : '<div class="unk">no activity yet</div>')}
        ${sec('Source', kv([['Sources', r.source_links?.length ? `<ul class="links">${r.source_links.map((l) => `<li><a href="${esc(/^https?:/.test(l) ? l : 'https://' + l.replace(/^.*?:\s*/, ''))}" target="_blank" rel="noopener">${esc(l.slice(0, 70))}</a></li>`).join('')}</ul>` : val(null)], ['Origin', `${esc(r.source_type)}${r.source_tier ? ` · ${esc(r.source_tier)}` : ''}`], ['Last checked', `${val(r.last_checked_raw)}`], ['Verification', `${val(r.verification_method)} · confidence ${val(r.confidence)}`], ['Updated', `${r.updated_at ? HFI.fmtDate(r.updated_at) : ''} by ${esc(r.updated_by || 'import')}`], ['id', `<code>${r.id}</code>`]]))}
        ${sec('Raw notes', `<div class="raw">${esc(r.notes || '')}</div>`)}
      </div>`;
      $('#d-close').addEventListener('click', () => HFI.select(null));
      $$('[data-act]', d).forEach((b) => b.addEventListener('click', () => HFI.drawer.action(r.id, b.dataset.act)));
      HFI.map.resize();
    },
    close() { const d = $('#drawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); document.body.classList.remove('drawer-open'); HFI.map.resize(); },
    action(id, act) {
      const r = HFI.record(id); const f = HFI.filters; const haus = HFI.nodes.get(f.haus) || null;
      if (act === 'star') { HFI.toggleShortlist(id); HFI.ui.renderAll(); HFI.drawer.open(id); }
      if (act === 'contacted') { HFI.saveEdit(id, { last_contacted_at: HFI.today(), deal_status: r.deal_status === 'not_contacted' || r.deal_status === 'research' ? 'contacted' : r.deal_status }); HFI.ui.renderAll(); HFI.drawer.open(id); }
      if (act === 'note') { const t = prompt('Note (what was said, numbers verbatim):'); if (t) { HFI.addNote(id, t); HFI.drawer.open(id); } }
      if (act === 'followup') { const d = prompt('Follow-up date (YYYY-MM-DD):', HFI.today()); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { HFI.saveEdit(id, { next_followup_at: d }); HFI.ui.renderAll(); HFI.drawer.open(id); } }
      if (act === 'copy-outreach') { const txt = HFI.outreachText(r, haus, f); navigator.clipboard?.writeText(txt); HFI.toast('Outreach text copied'); }
      if (act === 'edit') HFI.drawer.edit(id);
    },
    edit(id) {
      const r = HFI.record(id); const d = $('#drawer');
      const opt = (list, cur) => list.map((s) => `<option value="${s.id ?? s}" ${(s.id ?? s) === cur ? 'selected' : ''}>${esc(s.label ?? s)}</option>`).join('');
      const inp = (k, type = 'text', v = r[k]) => `<label>${k.replace(/_/g, ' ')}<input name="${k}" type="${type}" value="${v == null ? '' : esc(v)}"></label>`;
      d.querySelector('.d-body').innerHTML = `<form id="edit-form" class="edit">
        <label>deal status<select name="deal_status">${opt(HFI.DEAL_STATUSES, r.deal_status)}</select></label>
        <label>inventory class<select name="inventory_class">${opt(['candidate', 'contracted_partner', 'haus_operated', 'rejected', 'archived'], r.inventory_class)}</select></label>
        ${inp('negotiated_per_bed', 'number')}${inp('negotiated_monthly', 'number')}${inp('asking_per_bed', 'number')}
        ${inp('total_beds', 'number')}${inp('available_beds', 'number')}${inp('private_rooms', 'number')}${inp('shared_rooms', 'number')}
        ${inp('available_from', 'date')}${inp('available_until', 'date')}${inp('minimum_stay_days', 'number')}
        <label>kitchen<select name="kitchen_status">${opt(['communal', 'private', 'none', 'unknown'], r.kitchen_status)}</select></label>
        ${inp('contact_name')}${inp('contact_phone')}${inp('contact_email', 'email')}${inp('assigned_owner')}${inp('followed_up_by')}${inp('call_phone')}
        ${inp('next_action')}${inp('next_followup_at', 'date')}${inp('last_contacted_at', 'date')}${inp('last_price_verified_at', 'date', (r.last_price_verified_at || '').slice(0, 10))}${inp('last_availability_verified_at', 'date', (r.last_availability_verified_at || '').slice(0, 10))}
        <label>quoted terms<textarea name="quoted_terms">${esc(r.quoted_terms || '')}</textarea></label>
        <label>call notes<textarea name="call_notes">${esc(r.call_notes || '')}</textarea></label>
        <label>house<select name="house"><option value="">none</option>${opt([...HFI.nodes.values()].map((c) => ({ id: c.id, label: c.name })), r.haus_node_ids?.[0] || '')}</select></label>
        <label>use<select name="use"><option value="">unassigned</option>${opt(HFI.USES, r.use)}</select></label>
        ${inp('beds_reserved', 'number')}
        <div class="edit-actions"><button type="submit" class="btn sm primary">Save</button><button type="button" class="btn sm" id="edit-cancel">Cancel</button><span class="unk">Saved in this browser (updated_by: human). Export edits from the Export menu to sync.</span></div></form>`;
      $('#edit-cancel').addEventListener('click', () => HFI.drawer.open(id));
      $('#edit-form').addEventListener('submit', (e) => { e.preventDefault(); const fd = new FormData(e.target); const patch = {};
        for (const [k, v] of fd.entries()) { if (k === 'house') { patch.haus_node_ids = v ? [v] : []; continue; } const numeric = ['negotiated_per_bed', 'negotiated_monthly', 'asking_per_bed', 'total_beds', 'available_beds', 'private_rooms', 'shared_rooms', 'minimum_stay_days', 'beds_reserved'].includes(k); patch[k] = v === '' ? null : numeric ? +v : v; }
        if (patch.available_beds != null && !patch.last_availability_verified_at) patch.last_availability_verified_at = HFI.today();
        if (patch.negotiated_per_bed != null && r.negotiated_per_bed !== patch.negotiated_per_bed) patch.last_price_verified_at = patch.last_price_verified_at || HFI.today();
        HFI.saveEdit(id, patch); HFI.ui.renderAll(); HFI.drawer.open(id); HFI.toast('Saved'); });
    },
  };
  // outreach text: template family by operator type, variables from the record, the selected house and the search
  HFI.outreachText = (r, haus, f) => {
    const who = r.contact_name ? r.contact_name.split(/[,(·-]/)[0].trim() : 'there';
    const range = f.needBeds ? `${f.needBeds}` : haus?.profile ? `${haus.profile.beds_min} to ${haus.profile.beds_max}` : '10 to 20';
    const city = HFI.markets.get(r.market)?.name || 'San Francisco';
    const kind = r.operator_type === 'institution' ? 'residence hall block' : r.operator_type === 'receiver' ? 'interim master lease' : r.property_type === 'co-living' || r.property_type === 'hostel' ? 'block booking' : 'residential master lease';
    return `Hi ${who},\n\nI represent Haus (haus.fund), a founder residency in ${city}. We are placing a group of founders${f.from ? ` from ${HFI.fmtDate(f.from)} ${f.from.slice(0, 4)}` : ''} for ${f.nights || 90}+ nights and are looking at ${r.property_name} for a ${kind} of about ${range} beds.\n\nCould you tell me: beds available for those dates, the monthly rate per bed for a block, kitchen access, and minimum term? We decide quickly and pay as a credit tenant.\n\nThanks,\n`;
  };
  HFI.toast = (msg) => { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800); };
})();
