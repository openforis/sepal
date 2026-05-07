// Default timeSeries model. Mirrors GUI defaultModel:
//   - dates: 2000-01-01 .. today
//   - sources.dataSets: LANDSAT 4-9 (T1)
//   - options: union of optical, radar, planet defaults

const fmt = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

const getDefaults = () => ({
    dates: {
        startDate: '2000-01-01',
        endDate: fmt(new Date())
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
})

module.exports = {getDefaults}
