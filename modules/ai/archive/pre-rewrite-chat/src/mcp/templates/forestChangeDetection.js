module.exports = {
    id: 'forest-change-detection',
    recipeType: 'CCDC',
    name: 'Forest Change Detection (CCDC)',
    description: 'CCDC-based forest change detection using NDFI breakpoint band. Detects deforestation and degradation over the full Landsat archive.',
    tags: ['ccdc', 'forest', 'change-detection', 'deforestation', 'ndfi'],
    requiredOverrides: ['aoi'],
    model: {
        dates: {
            startDate: '2000-01-01',
            endDate: '2024-12-31'
        },
        sources: {
            cloudPercentageThreshold: 75,
            dataSets: {
                LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
            },
            breakpointBands: ['ndfi']
        },
        options: {
            corrections: [],
            orbits: ['ASCENDING', 'DESCENDING'],
            geometricCorrection: 'ELLIPSOID',
            speckleFilter: 'NONE',
            outlierRemoval: 'NONE',
            orbitOverlap: 'KEEP',
            tileOverlap: 'QUICK_REMOVE'
        },
        ccdcOptions: {
            dateFormat: 0,
            minObservations: 6,
            chiSquareProbability: 0.99,
            minNumOfYearsScaler: 1.33,
            lambda: 20,
            maxIterations: 25000
        }
    }
}
