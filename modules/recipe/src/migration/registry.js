import {currentVersion} from './engine.js'

// All recipes in every environment (dev, test, prod) are already at their latest type version, so
// no historical migration ever needs to run again. Each type keeps a single baseline entry whose
// key is the current version and whose value is `false` — a marker meaning "no migration necessary
// to reach this version". The engine treats a falsey entry as a no-op, so it only pins the
// version: currentVersion = highest key.
//
// To add a FUTURE migration, add a real transform keyed at the next version, e.g.
//   CLASSIFICATION: {5: false, 6: r => { ...transform... return r }}
// The engine will then migrate any recipe below 6 up to 6 and re-stamp it.
const MIGRATIONS_BY_TYPE = {
    MOSAIC: {8: false},
    RADAR_MOSAIC: {5: false},
    TIME_SERIES: {8: false},
    CCDC: {8: false},
    CCDC_SLICE: {2: false},
    REMAPPING: {2: false},
    CHANGE_ALERTS: {8: false},
    PHENOLOGY: {8: false},
    CLASSIFICATION: {5: false},
    CHANGE_DETECTION: {2: false}
}

const currentVersionForType = type =>
    MIGRATIONS_BY_TYPE[type] ? currentVersion(MIGRATIONS_BY_TYPE[type]) : 1

export {currentVersionForType, MIGRATIONS_BY_TYPE}
