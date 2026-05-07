// Default asset model. Mirrors the GUI's `defaultModel` from assetRecipe.js:
// `dates.type='ALL_DATES'` and `composite.type='MOSAIC'` (both only matter for
// ImageCollection assets, but set as a baseline). The default fromDate/toDate
// are placeholder values — they're only used when the user switches to
// CUSTOM_DATE_RANGE.
//
// `aoi` and `assetDetails` are intentionally absent — there's no sensible
// default for either; the LLM must populate them based on user intent.

const getDefaults = () => {
    const year = new Date().getUTCFullYear()
    return {
        dates: {
            type: 'ALL_DATES',
            fromDate: `${year}-01-01`,
            toDate: `${year + 1}-01-01`
        },
        composite: {
            type: 'MOSAIC'
        }
    }
}

module.exports = {getDefaults}
