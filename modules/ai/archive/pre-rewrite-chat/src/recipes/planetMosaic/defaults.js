// Default planetMosaic model. Mirrors GUI's `defaultModel` in
// planetMosaicRecipe.js, with corrections:
//   - GUI's defaultModel puts `histogramMatching` under `sources`. The actual
//     persisted shape (after the options panel applies) has it under `options`,
//     and the EE backend reads `model.options.histogramMatching`. We mirror the
//     persisted shape, not the GUI's stale defaultModel.
//   - GUI's defaultModel has source='NICFI'; the GUI's `valuesToModel` rewrites
//     this to 'BASEMAPS' on save. The persisted form is BASEMAPS + NICFI_ASSETS.
//
// `aoi` is intentionally absent — there's no sensible default.

const NICFI_ASSETS = [
    'projects/planet-nicfi/assets/basemaps/africa',
    'projects/planet-nicfi/assets/basemaps/asia',
    'projects/planet-nicfi/assets/basemaps/americas'
]

const fmt = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

const getDefaults = () => {
    // Mirror GUI: fromDate = start of year of (today - 2 months); toDate = min(today, fromDate + 1y).
    const today = new Date()
    const twoMonthsAgo = new Date(today)
    twoMonthsAgo.setUTCMonth(twoMonthsAgo.getUTCMonth() - 2)
    const fromDate = new Date(Date.UTC(twoMonthsAgo.getUTCFullYear(), 0, 1))
    const fromPlusYear = new Date(fromDate)
    fromPlusYear.setUTCFullYear(fromPlusYear.getUTCFullYear() + 1)
    const toDate = fromPlusYear < today ? fromPlusYear : today
    return {
        dates: {
            fromDate: fmt(fromDate),
            toDate: fmt(toDate)
        },
        sources: {
            source: 'BASEMAPS',
            assets: [...NICFI_ASSETS]
        },
        options: {
            cloudThreshold: 0.15,
            shadowThreshold: 0.4,
            cloudBuffer: 0,
            histogramMatching: 'DISABLED'
        }
    }
}

module.exports = {getDefaults}
