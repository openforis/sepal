import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    aoi: {},
    dates: {
        startDate: moment().subtract(3, 'months').format(DATE_FORMAT),
        endDate: moment().format(DATE_FORMAT)
    },
    sources: {
        landsat: {enabled: true, dataSets: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7']},
        sentinel2: {enabled: true},
        sentinel1: {enabled: false, orbits: ['ASCENDING', 'DESCENDING']},
        planet: {enabled: false, asset: null}
    },
    forestMask: {},
    diasOptions: {
        threshold: 3,
        consecutiveObservations: 3,
        cloudMasking: 'MODERATE'
    }
}

export const retrieveTask = {}

export const getDateRange = recipe => {
    const {startDate, endDate} = recipe.model.dates
    return [moment(startDate, DATE_FORMAT), moment(endDate, DATE_FORMAT)]
}
