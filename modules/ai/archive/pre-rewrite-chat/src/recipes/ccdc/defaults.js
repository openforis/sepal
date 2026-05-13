// Default CCDC model. Mirrors GUI defaultModel (moderate breakDetection preset).

const fmt = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

const getDefaults = () => ({
    dates: {
        startDate: '2000-01-01',
        endDate: fmt(new Date())
    },
    sources: {
        cloudPercentageThreshold: 75,
        dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']},
        breakpointBands: ['ndfi']
    },
    options: {
        corrections: [],
        orbits: ['ASCENDING', 'DESCENDING'],
        geometricCorrection: 'ELLIPSOID',
        spatialSpeckleFilter: 'NONE',
        outlierRemoval: 'NONE',
        orbitOverlap: 'KEEP',
        tileOverlap: 'QUICK_REMOVE'
    },
    ccdcOptions: {
        dateFormat: 1,
        minObservations: 6,
        chiSquareProbability: 0.9,
        minNumOfYearsScaler: 1.33,
        lambda: 20,
        maxIterations: 25000
    }
})

module.exports = {getDefaults}
