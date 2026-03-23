module.exports = {
    id: 'ndvi-time-series',
    recipeType: 'TIME_SERIES',
    name: 'NDVI Time Series',
    description: 'NDVI temporal analysis over the full Landsat archive. Useful for vegetation monitoring and trend analysis.',
    tags: ['time-series', 'ndvi', 'vegetation', 'landsat', 'monitoring'],
    requiredOverrides: ['aoi'],
    model: {
        dates: {
            startDate: '2000-01-01',
            endDate: '2024-12-31'
        },
        sources: {
            dataSets: {
                LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
            }
        },
        options: {
            corrections: [],
            orbits: ['ASCENDING', 'DESCENDING'],
            geometricCorrection: 'ELLIPSOID',
            speckleFilter: 'NONE',
            outlierRemoval: 'NONE',
            orbitOverlap: 'KEEP',
            tileOverlap: 'QUICK_REMOVE'
        }
    }
}
