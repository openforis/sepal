const fmt = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

const getDefaults = () => {
    const today = new Date()
    const oneYearAgo = new Date(today)
    oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1)
    return {
        dates: {
            fromDate: fmt(oneYearAgo),
            toDate: fmt(today)
        },
        options: {
            orbits: ['ASCENDING', 'DESCENDING'],
            orbitNumbers: 'DOMINANT',
            geometricCorrection: 'ELLIPSOID',
            spatialSpeckleFilter: 'LEE',
            kernelSize: 9,
            sigma: 0.9,
            strongScatterers: 'RETAIN',
            strongScattererValues: [0, -5],
            snicSize: 5,
            snicCompactness: 0.15,
            multitemporalSpeckleFilter: 'NONE',
            numberOfImages: 10,
            outlierRemoval: 'MODERATE',
            mask: ['SIDES', 'FIRST_LAST'],
            minAngle: 30.88,
            maxAngle: 45.35,
            minObservations: 20
        }
    }
}

module.exports = {getDefaults}
