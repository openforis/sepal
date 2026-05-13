module.exports = {
    id: 'radar-monthly-mosaic',
    recipeType: 'RADAR_MOSAIC',
    name: 'Monthly Sentinel-1 SAR Mosaic',
    description: 'Monthly Sentinel-1 SAR mosaic with terrain correction and Lee Sigma speckle filtering. Works through cloud cover.',
    tags: ['radar', 'sentinel-1', 'monthly', 'sar', 'cloud-free'],
    requiredOverrides: ['aoi'],
    model: {
        dates: {
            fromDate: '2024-01-01',
            toDate: '2024-02-01'
        },
        options: {
            orbits: ['ASCENDING', 'DESCENDING'],
            orbitNumbers: 'ALL',
            geometricCorrection: 'TERRAIN',
            spatialSpeckleFilter: 'LEE_SIGMA',
            kernelSize: 9,
            sigma: 0.9,
            strongScatterers: 'RETAIN',
            strongScattererValues: [0, -5],
            multitemporalSpeckleFilter: 'NONE',
            numberOfImages: 10,
            outlierRemoval: 'MODERATE',
            mask: ['SIDES', 'FIRST_LAST'],
            minAngle: 30.88,
            maxAngle: 45.35,
            minObservations: 1
        }
    }
}
