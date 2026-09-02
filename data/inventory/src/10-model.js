// Data model: records + local edits overlay (per browser, with history), freshness, statuses, formatters.
(function () {
  const C = HFI.CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  HFI.$ = $; HFI.$$ = $$;
  HFI.esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  HFI.today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  HFI.daysBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400000);
  HFI.fmtMoney = (n, opts = {}) => n == null ? null : (opts.short && n >= 1000 ? '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k' : '$' + Math.round(n).toLocaleString());
  HFI.fmtDate = (iso) => { if (!iso) return null; const m = String(iso).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/); const d = m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) : new Date(iso); return iso.length === 7 ? d.toLocaleString('en-US', { month: 'short', year: 'numeric' }) : d.toLocaleString('en-US', { month: 'short', day: 'numeric' }); };
  HFI.ago = (iso) => { if (!iso) return null; const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`; };

  // ---- deal statuses (pipeline order, label, tone, column) ----
  HFI.DEAL_STATUSES = [
    { id: 'research', label: 'Research', col: 'Research', tone: 'muted' },
    { id: 'not_contacted', label: 'Not contacted', col: 'Research', tone: 'muted' },
    { id: 'contacted', label: 'Contacted', col: 'Contacted', tone: 'info' },
    { id: 'awaiting_reply', label: 'Awaiting reply', col: 'Contacted', tone: 'info' },
    { id: 'call_scheduled', label: 'Call scheduled', col: 'Contacted', tone: 'info' },
    { id: 'negotiating', label: 'Negotiating', col: 'Negotiating', tone: 'warn' },
    { id: 'verbal_yes', label: 'Verbal yes', col: 'Negotiating', tone: 'warn' },
    { id: 'diligence', label: 'Diligence', col: 'Contracting', tone: 'warn' },
    { id: 'contract_sent', label: 'Contract sent', col: 'Contracting', tone: 'warn' },
    { id: 'signed', label: 'Signed', col: 'Signed', tone: 'good' },
    { id: 'unavailable', label: 'Unavailable', col: 'Unavailable', tone: 'bad' },
    { id: 'rejected', label: 'Rejected', col: 'Unavailable', tone: 'bad' },
    { id: 'archived', label: 'Archived', col: 'Unavailable', tone: 'muted' },
  ];
  HFI.statusMeta = (id) => HFI.DEAL_STATUSES.find((s) => s.id === id) || HFI.DEAL_STATUSES[0];
  HFI.ACTIVE_DEAL = new Set(['negotiating', 'verbal_yes', 'diligence', 'contract_sent']);
  HFI.DEAD = new Set(['unavailable', 'rejected', 'archived']);
  HFI.USES = ['cohort', 'overflow', 'alumni', 'staff', 'femme', 'safe', 'unassigned'];

  // ---- local edits overlay: {id: {fields, history:[{at,by,field,from,to}], notes:[{at,by,text}]}} ----
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  HFI.edits = load(C.STORAGE_KEY, {});
  HFI.shortlist = new Set(load(C.SHORTLIST_KEY, []));
  HFI.prefs = load(C.PREFS_KEY, {});
  HFI.savePrefs = () => save(C.PREFS_KEY, HFI.prefs);
  HFI.toggleShortlist = (id) => { HFI.shortlist.has(id) ? HFI.shortlist.delete(id) : HFI.shortlist.add(id); save(C.SHORTLIST_KEY, [...HFI.shortlist]); };
  HFI.EDITABLE = ['deal_status', 'inventory_class', 'negotiated_per_bed', 'negotiated_monthly', 'asking_per_bed', 'total_beds', 'available_beds', 'private_rooms', 'shared_rooms', 'available_from', 'available_until', 'minimum_stay_days',
    'contact_name', 'contact_phone', 'contact_email', 'assigned_owner', 'next_action', 'next_followup_at', 'last_contacted_at', 'last_price_verified_at', 'last_availability_verified_at', 'quoted_terms', 'use', 'beds_reserved', 'cohort_ids', 'haus_node_ids', 'kitchen_status', 'followed_up_by', 'call_phone', 'call_notes'];
  HFI.saveEdit = (id, patch, by = 'human') => {
    const e = (HFI.edits[id] ??= { fields: {}, history: [], notes: [] });
    const base = HFI.raw.get(id) || {};
    const at = new Date().toISOString();
    for (const [k, v] of Object.entries(patch)) {
      const from = e.fields[k] !== undefined ? e.fields[k] : base[k];
      if (JSON.stringify(from) === JSON.stringify(v)) continue;
      e.history.push({ at, by, field: k, from: from ?? null, to: v });
      e.fields[k] = v;
    }
    e.fields.updated_at = at; e.fields.updated_by = by;
    save(C.STORAGE_KEY, HFI.edits);
  };
  HFI.addNote = (id, text, by = 'human') => { const e = (HFI.edits[id] ??= { fields: {}, history: [], notes: [] }); e.notes.push({ at: new Date().toISOString(), by, text }); save(C.STORAGE_KEY, HFI.edits); };
  HFI.exportEdits = () => JSON.stringify(HFI.edits, null, 2);
  HFI.clearEdits = () => { HFI.edits = {}; save(C.STORAGE_KEY, {}); };

  // ---- freshness ----
  HFI.freshness = (iso, kind) => {
    const t = C.STALE[kind];
    if (!iso) return { level: 'unknown', days: null, label: 'not checked' };
    const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));
    const level = days <= t.fresh ? 'fresh' : days <= t.aging ? 'aging' : 'stale';
    return { level, days, label: `${kind === 'price' ? 'Price' : kind === 'availability' ? 'Availability' : 'Contact'} checked ${HFI.ago(iso)}` };
  };

  // ---- records with overlay + derived fields ----
  HFI.raw = new Map();
  HFI.load = (data) => {
    HFI.data = data;
    HFI.raw = new Map(data.records.map((r) => [r.id, r]));
    HFI.nodes = new Map(data.haus_nodes.map((n) => [n.id, n]));
    HFI.cohorts = new Map(data.cohorts.map((c) => [c.id, c]));
    HFI.markets = new Map(data.markets.map((m) => [m.id, m]));
  };
  HFI.record = (id) => { const base = HFI.raw.get(id); if (!base) return null; const e = HFI.edits[id]; const r = e ? { ...base, ...e.fields } : { ...base }; return derive(r); };
  HFI.records = () => [...HFI.raw.keys()].map(HFI.record);
  function derive(r) {
    // best current price per bed: negotiated > verified > asking estimate
    r.price_kind = r.negotiated_per_bed != null ? 'negotiated' : r.verified_per_bed != null ? 'verified' : r.asking_per_bed != null ? 'estimate' : 'unknown';
    r.price_per_bed = r.negotiated_per_bed ?? r.verified_per_bed ?? r.asking_per_bed ?? null;
    r.price_private = r.verified_private_room ?? null;
    r.price_fresh = HFI.freshness(r.price_kind === 'estimate' ? null : r.last_price_verified_at, 'price');
    r.avail_fresh = HFI.freshness(r.last_availability_verified_at, 'availability');
    r.contact_fresh = HFI.freshness(r.last_contacted_at, 'contact');
    r.walk = r.frontier_walk_minutes ?? r.frontier_transit_minutes_est ?? null;
    r.walk_is_estimate = r.frontier_walk_minutes == null;
    r.beds = r.total_beds ?? r.total_rooms ?? null;
    r.kitchen_ok = r.kitchen_status === 'communal' || r.kitchen_status === 'private';
    r.dead = HFI.DEAD.has(r.deal_status) || r.inventory_class === 'rejected' || r.inventory_class === 'archived';
    r.is_haus_linked = (r.haus_node_ids || []).length > 0;
    r.attention = attention(r);
    return r;
  }
  function attention(r) {
    const out = [];
    if (r.dead) return out;
    const today = HFI.today();
    if (r.next_followup_at && r.next_followup_at <= today) out.push('Follow-up overdue');
    if (r.price_kind !== 'unknown' && r.price_fresh.level === 'stale') out.push('Price stale');
    if (r.available_beds != null && r.avail_fresh.level === 'stale') out.push('Availability stale');
    if (r.deal_status === 'contract_sent' || r.deal_status === 'diligence') out.push('Contract pending');
    if (!r.contact_phone && !r.contact_email && !r.contact_path) out.push('Missing contact');
    if (r.contact_verify) out.push('Contact needs verifying');
    if (HFI.ACTIVE_DEAL.has(r.deal_status) && r.last_contacted_at && HFI.daysBetween(r.last_contacted_at, today) > C.NEGOTIATION_WAIT_DAYS) out.push('Negotiation waiting too long');
    if (r.deal_status === 'awaiting_reply' && r.last_contacted_at && HFI.daysBetween(r.last_contacted_at, today) > 7) out.push('No reply in a week');
    return out;
  }

  // ---- timeline: tracker notes + local notes + edit history, newest first ----
  HFI.timeline = (r) => {
    const items = [];
    for (const seg of (r.notes || '').split(' | ')) {
      const m = seg.match(/^\[(\d{4}-\d{2}-\d{2})\s+([^\]]+)\]\s*(.*)$/);
      if (m) items.push({ at: m[1], by: m[2], text: m[3], kind: 'note' });
      else if (seg.trim()) items.push({ at: r.last_checked_at || r.created_at, by: r.source_type === 'sheet-inventory' ? 'Notion tracker' : 'housing report', text: seg.trim(), kind: 'source' });
    }
    const e = HFI.edits[r.id];
    if (e) {
      for (const n of e.notes) items.push({ at: n.at.slice(0, 10), by: n.by, text: n.text, kind: 'note' });
      for (const h of e.history) items.push({ at: h.at.slice(0, 10), by: h.by, text: `${h.field.replace(/_/g, ' ')}: ${fmtVal(h.from)} → ${fmtVal(h.to)}`, kind: 'change' });
    }
    return items.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  };
  const fmtVal = (v) => v == null || v === '' ? 'unknown' : Array.isArray(v) ? v.join(', ') : String(v);

  // ---- date helpers ----
  HFI.dateLabel = (iso, precision) => !iso ? 'no start date given' : precision === 'month' ? `${HFI.fmtDate(iso)} (month only)` : `${HFI.fmtDate(iso)}, ${iso.slice(0, 4)}`;
})();
