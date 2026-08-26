// Scoring - implements CLAUDE.md "Scoring (0-100)" exactly. Deterministic; no dates involved.
// The Step-6 staleness penalty (-10 for 15-45d old verification) is applied in the FRONT END,
// because it depends on "today" and build.ts must produce identical output run-to-run.
import type { Property, ScoreBreakdown } from './schema';

export const WEIGHTS = {
  transit: 35, price: 30, kitchen: 15, beds: 20,
  target_price: 1000, max_price: 2200,
  walk_full: 10, walk_zero: 45,
  sept15_bonus: 5, tourist_no_kitchen_cap: 40,
  safety_rough: 8, safety_mixed: 3, reviews_bad: 7, reviews_concerns: 3, safety_floor: 15,
  price_unknown_pts: 5, // workbook README: "Blank price = 5 pts (unknown)"
};

const lerp = (v: number, full: number, zero: number, max: number) => {
  if (v <= full) return max;
  if (v >= zero) return 0;
  return +(max * (1 - (v - full) / (zero - full))).toFixed(3);
};

export function scoreProperty(p: Property): { score: number; breakdown: ScoreBreakdown } {
  const notes: string[] = [];
  const caps: string[] = [];

  // 1. Transit (35) - ≤10 min walk = full; ≥45 = 0; East Bay / outside SF = 0.
  let transit = 0;
  if (p.east_bay || !['SF-priority', 'SF-other'].includes(p.region)) {
    transit = 0;
    notes.push(`transit: region=${p.region} → 0 (outside SF; see CLAUDE.md geography rule)`);
  } else {
    const m = p.walk_min_from_frontier ?? p.transit_min_to_frontier;
    if (m == null) { transit = 0; notes.push('transit: no walk/transit minutes available → 0'); }
    else {
      transit = lerp(m, WEIGHTS.walk_full, WEIGHTS.walk_zero, WEIGHTS.transit);
      notes.push(`transit: ${m} min (${p.walk_min_from_frontier != null ? p.walk_source : 'computed heuristic'})`);
    }
  }

  // 2. Price per bed (30) - ≤$1,000 full, linear to 0 at $2,200; unknown = 5.
  let price: number;
  if (p.price_per_bed_est == null) { price = WEIGHTS.price_unknown_pts; notes.push('price: unknown → 5'); }
  else { price = lerp(p.price_per_bed_est, WEIGHTS.target_price, WEIGHTS.max_price, WEIGHTS.price); notes.push(`price: $${p.price_per_bed_est}/bed`); }

  // 3. Kitchen (15)
  const kitchen = p.kitchen === 'communal' || p.kitchen === 'private' ? 15 : p.kitchen === 'unknown' ? 5 : 0;
  notes.push(`kitchen: ${p.kitchen}`);

  // 4. Bed-count fit (20) - 40-60 full; 20-39 = 12 (pair candidate); <20 = 4; >100 = 15; 61-100 = 12 (matches workbook: Embassy 84 → 12).
  let beds: number;
  const b = p.beds_est;
  if (b == null) { beds = 4; notes.push('beds: unknown → 4'); }
  else if (b >= 40 && b <= 60) beds = 20;
  else if (b >= 20 && b < 40) { beds = 12; notes.push('beds: 20-39 → pair candidate'); }
  else if (b < 20) beds = 4;
  else if (b > 100) beds = 15;
  else { beds = 12; notes.push('beds: 61-100 → 12 (over ideal; partial take)'); }

  // 5. Safety comes OFF the total: the block rating plus what reviews say, capped at -15.
  let safety = 0;
  if (p.safety_flag === 'rough-block') { safety -= WEIGHTS.safety_rough; notes.push(`safety: rough block, minus ${WEIGHTS.safety_rough}`); }
  else if (p.safety_flag === 'mixed') { safety -= WEIGHTS.safety_mixed; notes.push(`safety: mixed block, minus ${WEIGHTS.safety_mixed}`); }
  if (p.safety_reviews === 'bad') { safety -= WEIGHTS.reviews_bad; notes.push(`reviews: safety complaints, minus ${WEIGHTS.reviews_bad}`); }
  else if (p.safety_reviews === 'concerns') { safety -= WEIGHTS.reviews_concerns; notes.push(`reviews: some concerns, minus ${WEIGHTS.reviews_concerns}`); }
  else if (p.safety_reviews === 'good' && p.review_rating) notes.push(`reviews: good (${p.review_rating})`);
  safety = Math.max(safety, -WEIGHTS.safety_floor);

  let score = transit + price + kitchen + beds + safety;

  // Hard caps
  if (['taken', 'sold', 'ruled-out'].includes(p.status)) { score = 0; caps.push(`status=${p.status} → 0`); }
  if (p.type === 'tourist-hotel' && p.kitchen === 'none' && score > WEIGHTS.tourist_no_kitchen_cap) {
    score = WEIGHTS.tourist_no_kitchen_cap; caps.push('tourist-hotel with no kitchen → cap 40');
  }

  // Bonus
  let sept15_bonus = 0;
  if (p.sept15_ready === true && score > 0) { sept15_bonus = WEIGHTS.sept15_bonus; score = Math.min(100, score + sept15_bonus); }

  score = +score.toFixed(2);
  return { score, breakdown: { transit, price, kitchen, beds, safety, sept15_bonus, caps_applied: caps, method_notes: notes } };
}
