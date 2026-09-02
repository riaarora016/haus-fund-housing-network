// HAUS FIT: transparent 0-100 candidate score. Six parts, each with points, max and a plain-words note.
(function () {
  const C = HFI.CONFIG;
  const lerp = (v, full, zero, max) => v <= full ? max : v >= zero ? 0 : +(max * (1 - (v - full) / (zero - full))).toFixed(1);
  HFI.hausFit = (r, ctx) => {
    const W = ctx.weights || C.WEIGHTS, target = ctx.targetPrice || C.TARGET_PRICE_PER_BED, need = ctx.needBeds || 40;
    const parts = {}; const reasons = []; let excluded = false;
    // price
    if (r.price_per_bed == null) parts.price = { pts: +(W.price * 0.2).toFixed(1), max: W.price, note: 'no price yet' };
    else parts.price = { pts: lerp(r.price_per_bed, target, target * C.PRICE_ZERO_MULTIPLIER, W.price), max: W.price, note: `${HFI.fmtMoney(r.price_per_bed)}/bed (${r.price_kind})` };
    // distance
    if (r.east_bay || !['SF-priority', 'SF-other'].includes(r.region)) parts.distance = { pts: 0, max: W.distance, note: 'outside SF, ranked to the bottom by rule' };
    else if (r.walk == null) parts.distance = { pts: 0, max: W.distance, note: 'no walk time available' };
    else parts.distance = { pts: lerp(r.walk, C.WALK_FULL_MIN, C.WALK_ZERO_MIN, W.distance), max: W.distance, note: `${r.walk} min ${r.walk_is_estimate ? '(est.)' : 'walk'}` };
    // kitchen
    if (r.kitchen_ok) parts.kitchen = { pts: W.kitchen, max: W.kitchen, note: `${r.kitchen_status} kitchen` };
    else if (r.kitchen_status === 'none') { parts.kitchen = { pts: 0, max: W.kitchen, note: 'NO KITCHEN' }; if (ctx.kitchenHard) { excluded = true; reasons.push('no kitchen'); } }
    else parts.kitchen = { pts: +(W.kitchen * 0.4).toFixed(1), max: W.kitchen, note: 'kitchen unknown' };
    // capacity relative to what the cohort needs
    const b = r.beds;
    if (b == null) parts.capacity = { pts: +(W.capacity * 0.25).toFixed(1), max: W.capacity, note: 'bed count unknown' };
    else if (b >= Math.min(need, 40) && b <= 100) parts.capacity = { pts: W.capacity, max: W.capacity, note: `${b} beds, could house the group` };
    else if (b >= 20) parts.capacity = { pts: +(W.capacity * 0.67).toFixed(1), max: W.capacity, note: `${b} beds, pair with another building` };
    else if (b > 100) parts.capacity = { pts: +(W.capacity * 0.8).toFixed(1), max: W.capacity, note: `${b} beds, more than needed` };
    else parts.capacity = { pts: +(W.capacity * 0.3).toFixed(1), max: W.capacity, note: `${b} beds, small` };
    // safety signal
    let s = r.safety_flag === 'ok' ? W.safety : r.safety_flag === 'mixed' ? W.safety * 0.6 : r.safety_flag === 'rough-block' ? W.safety * 0.2 : W.safety * 0.5;
    if (r.safety_reviews === 'bad') s = Math.max(0, s - W.safety * 0.3); else if (r.safety_reviews === 'concerns') s = Math.max(0, s - W.safety * 0.1);
    parts.safety = { pts: +s.toFixed(1), max: W.safety, note: `${r.safety_flag === 'rough-block' ? 'rough block' : r.safety_flag === 'mixed' ? 'mixed block' : r.safety_flag === 'ok' ? 'calm block' : 'no signal'}${r.safety_reviews ? ', reviews: ' + r.safety_reviews : ''}` };
    // timing against the cohort start
    const start = ctx.cohort?.start_date;
    if (r.available_from && start) parts.timing = r.available_from <= start ? { pts: W.timing, max: W.timing, note: `available from ${HFI.fmtDate(r.available_from)}` } : { pts: 0, max: W.timing, note: `not until ${HFI.fmtDate(r.available_from)}` };
    else if (r.sept15_ready === true) parts.timing = { pts: W.timing, max: W.timing, note: 'ready for arrival day' };
    else if (r.sept15_ready === false) parts.timing = { pts: 0, max: W.timing, note: 'not ready for arrival day' };
    else parts.timing = { pts: +(W.timing * 0.4).toFixed(1), max: W.timing, note: 'move-in date unknown' };
    let score = Object.values(parts).reduce((a, p) => a + p.pts, 0);
    if (r.dead) { score = 0; reasons.push(HFI.statusMeta(r.deal_status).label.toLowerCase()); }
    return { score: Math.round(score), parts, excluded, reasons };
  };
})();
