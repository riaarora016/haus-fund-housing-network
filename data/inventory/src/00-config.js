// Haus Fund Inventory: configuration. Every tunable number lives here, not in UI code.
const HFI = (window.HFI = {});
HFI.CONFIG = {
  APP_NAME: 'Haus Fund Inventory',
  DEFAULT_MARKET: 'sf',
  DEFAULT_COHORT: 'c3',
  TARGET_PRICE_PER_BED: 1000,        // planning target from the Aug 20 call; editable in the UI
  DEFAULT_MAX_PER_BED: 1200,
  DEFAULT_MAX_WALK_MIN: 25,
  DEFAULT_STAY_NIGHTS: 30,
  WALK_FULL_MIN: 10,                 // full distance points at or under this walk
  WALK_ZERO_MIN: 45,                 // zero distance points at or over this walk
  PRICE_ZERO_MULTIPLIER: 2.2,        // zero price points at target x this
  WEIGHTS: { price: 25, distance: 25, kitchen: 20, capacity: 15, safety: 10, timing: 5 },
  STALE: {                           // days: fresh <= a, aging <= b, stale beyond
    price: { fresh: 7, aging: 14, stale: 45 },
    availability: { fresh: 7, aging: 14, stale: 30 },
    contact: { fresh: 14, aging: 30, stale: 60 },
  },
  NEGOTIATION_WAIT_DAYS: 14,
  MAP: { MAX_ZOOM_FACTOR: 32, HI_TILE_K: 0.85, MAP_MODE_MAX_K: 99, CLUSTER_CELL_PX: 56, CLUSTER_MIN_K: 1.1, SEARCH_AREA_MOVE_FRACTION: 0.25, FLY_MS: 380 },
  STORAGE_KEY: 'hfi:edits:v1',
  SHORTLIST_KEY: 'hfi:shortlist:v1',
  PREFS_KEY: 'hfi:prefs:v1',
};
