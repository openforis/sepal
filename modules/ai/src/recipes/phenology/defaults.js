// Default phenology model. Mirrors GUI defaultModel.

const getDefaults = () => {
    const lastYear = new Date().getUTCFullYear() - 1
    return {
        dates: {
            fromYear: lastYear,
            toYear: lastYear
        },
        sources: {
            cloudPercentageThreshold: 75,
            dataSets: {LANDSAT: ['LANDSAT_8']},
            band: 'evi'
        },
        options: {
            corrections: ['SR'],
            cloudDetection: ['QA', 'CLOUD_SCORE'],
            cloudMasking: 'AGGRESSIVE',
            snowMasking: 'ON',
            orbits: ['ASCENDING', 'DESCENDING'],
            geometricCorrection: 'ELLIPSOID',
            speckleFilter: 'NONE',
            outlierRemoval: 'NONE'
        }
    }
}

module.exports = {getDefaults}
