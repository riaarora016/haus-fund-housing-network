// Filters, search, sorting, and URL state.
(function () {
  const C = HFI.CONFIG;
  HFI.defaultFilters = (cohort) => ({
    market: C.DEFAULT_MARKET, cohort: cohort?.id || C.DEFAULT_COHORT,
    from: cohort?.start_date || '2026-09-15', nights: C.DEFAULT_STAY_NIGHTS,
    minBeds: null, maxBed: C.DEFAULT_MAX_PER_BED, maxWalk: C.DEFAULT_MAX_WALK_MIN, kitchen: true, room: 'shared',
    statuses: [], classes: ['candidate', 'contracted_partner'], verifiedOnly: false, attention: false, shortlist: false, haus: '',
    area: null, q: '', sort: 'fit', targetPrice: C.TARGET_PRICE_PER_BED,
  });
  HFI.filters = HFI.defaultFilters(null);
  HFI.SORTS = [['fit', 'Best fit'], ['price', 'Lowest $/bed'], ['walk', 'Closest'], ['beds', 'Most beds'], ['verified', 'Recently verified'], ['status', 'Deal status']];

  const inArea = (r, a) => a && r.lat != null && r.lat >= a.s && r.lat <= a.n && r.lng >= a.w && r.lng <= a.e;
  const text = (r) => [r.property_name, r.name_detail, r.address, r.neighborhood, r.contact_name, r.contact_org, r.operator_name, r.notes, (r.haus_node_ids || []).join(' ')].join(' ').toLowerCase();
  HFI.priceFor = (r, room) => room === 'private' ? (r.price_private ?? (r.property_type === 'hostel' ? null : r.price_per_bed)) : r.price_per_bed;

  HFI.matches = (r, f) => {
    if (r.market !== f.market) return false;
    if (!f.classes.includes(r.inventory_class)) return false;
    if (f.statuses.length && !f.statuses.includes(r.deal_status)) return false;
    if (f.haus && !(r.haus_node_ids || []).includes(f.haus)) return false;
    if (f.shortlist && !HFI.shortlist.has(r.id)) return false;
    if (f.attention && !r.attention.length) return false;
    if (f.kitchen && r.kitchen_status === 'none') return false;
    if (f.minBeds != null && (r.beds == null || r.beds < f.minBeds)) return false;
    const price = HFI.priceFor(r, f.room);
    if (f.maxBed != null && price != null && price > f.maxBed) return false;
    if (f.verifiedOnly && r.price_kind !== 'verified' && r.price_kind !== 'negotiated') return false;
    if (f.room === 'private' && r.property_type === 'hostel') return false;
    if (f.maxWalk != null && r.walk != null && r.walk > f.maxWalk) return false;
    if (r.minimum_stay_days != null && f.nights != null && r.minimum_stay_days > f.nights) return false;
    if (r.available_from && f.from && r.available_from > f.from) return false;
    if (f.area && !inArea(r, f.area)) return false;
    if (f.q && !text(r).includes(f.q.toLowerCase())) return false;
    return true;
  };
  HFI.sortFn = (sort, room) => (a, b) => {
    switch (sort) {
      case 'price': return (HFI.priceFor(a, room) ?? 1e9) - (HFI.priceFor(b, room) ?? 1e9);
      case 'walk': return (a.walk ?? 999) - (b.walk ?? 999);
      case 'beds': return (b.beds ?? 0) - (a.beds ?? 0);
      case 'verified': return (b.last_price_verified_at || '').localeCompare(a.last_price_verified_at || '');
      case 'status': return HFI.DEAL_STATUSES.findIndex((s) => s.id === b.deal_status) - HFI.DEAL_STATUSES.findIndex((s) => s.id === a.deal_status) || (b.fit?.score ?? 0) - (a.fit?.score ?? 0);
      default: return (b.fit?.score ?? 0) - (a.fit?.score ?? 0);
    }
  };
  // active chips for the summary line
  HFI.activeChips = (f) => {
    const out = [];
    if (f.from) out.push({ k: 'from', label: `${HFI.fmtDate(f.from)} · ${f.nights}n` });
    if (f.maxBed != null) out.push({ k: 'maxBed', label: `≤ ${HFI.fmtMoney(f.maxBed, { short: true })}/bed` });
    if (f.maxWalk != null) out.push({ k: 'maxWalk', label: `≤ ${f.maxWalk} min` });
    if (f.kitchen) out.push({ k: 'kitchen', label: 'Kitchen ✓' });
    if (f.minBeds != null) out.push({ k: 'minBeds', label: `${f.minBeds}+ beds` });
    if (f.room === 'private') out.push({ k: 'room', label: 'Private' });
    if (f.statuses.length) out.push({ k: 'statuses', label: f.statuses.map((s) => HFI.statusMeta(s).label).join(', ') });
    if (f.haus) out.push({ k: 'haus', label: HFI.nodes.get(f.haus)?.name || f.haus });
    if (f.verifiedOnly) out.push({ k: 'verifiedOnly', label: 'Verified prices' });
    if (f.attention) out.push({ k: 'attention', label: 'Needs attention' });
    if (f.shortlist) out.push({ k: 'shortlist', label: 'Shortlist' });
    if (f.area) out.push({ k: 'area', label: 'This map area' });
    if (f.q) out.push({ k: 'q', label: `“${f.q}”` });
    return out;
  };
  HFI.relaxFilter = (f, k) => { switch (k) {
    case 'maxWalk': f.maxWalk = null; break; case 'maxBed': f.maxBed = null; break; case 'kitchen': f.kitchen = false; break; case 'minBeds': f.minBeds = null; break;
    case 'room': f.room = 'shared'; break; case 'statuses': f.statuses = []; break; case 'haus': f.haus = ''; break; case 'verifiedOnly': f.verifiedOnly = false; break;
    case 'attention': f.attention = false; break; case 'shortlist': f.shortlist = false; break; case 'area': f.area = null; break; case 'q': f.q = ''; break; case 'from': f.from = null; break; } };

  // ---- URL state (no contact info ever goes into the URL) ----
  HFI.toParams = (f, extra = {}) => {
    const p = new URLSearchParams();
    const d = HFI.defaultFilters(HFI.cohorts.get(f.cohort));
    p.set('market', f.market); p.set('cohort', f.cohort);
    for (const k of ['from', 'nights', 'minBeds', 'maxBed', 'maxWalk', 'room', 'sort', 'targetPrice', 'q', 'haus']) if (f[k] != null && f[k] !== '' && String(f[k]) !== String(d[k])) p.set(k, f[k]);
    for (const k of ['kitchen', 'verifiedOnly', 'attention', 'shortlist']) if (f[k] !== d[k]) p.set(k, f[k] ? '1' : '0');
    if (f.statuses.length) p.set('status', f.statuses.join(','));
    if (JSON.stringify(f.classes) !== JSON.stringify(d.classes)) p.set('class', f.classes.join(','));
    if (f.area) p.set('area', [f.area.s, f.area.w, f.area.n, f.area.e].map((v) => v.toFixed(4)).join(','));
    for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') p.set(k, v);
    return p;
  };
  HFI.fromParams = (sp) => {
    const cohort = HFI.cohorts.get(sp.get('cohort') || C.DEFAULT_COHORT) || HFI.cohorts.get(C.DEFAULT_COHORT);
    const f = HFI.defaultFilters(cohort);
    if (sp.get('market')) f.market = sp.get('market');
    for (const k of ['from', 'room', 'sort', 'q', 'haus']) if (sp.has(k)) f[k] = sp.get(k);
    for (const k of ['nights', 'minBeds', 'maxBed', 'maxWalk', 'targetPrice']) if (sp.has(k)) f[k] = sp.get(k) === '' ? null : +sp.get(k);
    for (const k of ['kitchen', 'verifiedOnly', 'attention', 'shortlist']) if (sp.has(k)) f[k] = sp.get(k) === '1';
    if (sp.has('status')) f.statuses = sp.get('status').split(',').filter(Boolean);
    if (sp.has('class')) f.classes = sp.get('class').split(',').filter(Boolean);
    if (sp.has('area')) { const [s, w, n, e] = sp.get('area').split(',').map(Number); if ([s, w, n, e].every(Number.isFinite)) f.area = { s, w, n, e }; }
    return f;
  };
})();
