import moment from 'moment'

export const sources = ['landsat', 'sentinel2']

export const imageSourceById = {
    landsat: {
        dataSets: [
            'landsat8',
            'landsat7',
            'landsat45',
            'landsat8T2',
            'landsat7T2',
            'landsat5T2'
        ]
    },
    sentinel2: {
        dataSets: [
            'sentinel2'
        ]
    }
}

export const dataSetById = {
    landsat8: {
        fromYear: 2013,
        quality: 1
    },
    landsat7: {
        fromYear: 1999,
        quality: 2,
    },
    landsat45: {
        fromYear: 1982,
        toYear: 2012,
        quality: 2,
    },
    landsat8T2: {
        fromYear: 2013,
        quality: 3,
    },
    landsat7T2: {
        fromYear: 1999,
        quality: 3,
    },
    landsat5T2: {
        fromYear: 1984,
        toYear: 2012,
        quality: 3,
    },
    sentinel2: {
        fromYear: 2015,
        quality: 1
    }
}

export const isDataSetInDateRange = (dataSetId, fromDate, toDate) => {
    const dataSet = dataSetById[dataSetId]
    const startOk = !dataSet.toYear || moment(fromDate).year() <= dataSet.toYear
    const endOk = moment(toDate).subtract(1, 'days').year() >= dataSet.fromYear
    return startOk && endOk
}

export const isSourceInDateRange = (sourceId, fromDate, toDate) => {
    if (!sourceId)
        return false
    else
        return !!imageSourceById[sourceId].dataSets.find((dataSetId) =>
            isDataSetInDateRange(dataSetId, fromDate, toDate)
        )
}