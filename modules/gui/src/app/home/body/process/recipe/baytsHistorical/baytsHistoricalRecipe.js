import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().subtract(1, 'year').format(DATE_FORMAT),
        toDate: moment().format(DATE_FORMAT)
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
        minObservations: 20,
    }
}

export const retrieveTask = {
    dataSetType: 'RADAR'
}
