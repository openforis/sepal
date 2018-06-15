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
            'landsat45T2'
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
        quality: 1,
        name: 'Landsat 8',
        shortName: 'L8'
    },
    landsat7: {
        fromYear: 1999,
        quality: 2,
        name: 'Landsat 7',
        shortName: 'L7'
    },
    landsat45: {
        fromYear: 1982,
        toYear: 2012,
        quality: 2,
        name: 'Landsat 4-5',
        shortName: 'L4-5'
    },
    landsat8T2: {
        fromYear: 2013,
        quality: 3,
        name: 'Landsat 8, tier 2',
        shortName: 'L8 T2'
    },
    landsat7T2: {
        fromYear: 1999,
        quality: 3,
        name: 'Landsat 7, tier 2',
        shortName: 'L7 T2'
    },
    landsat45T2: {
        fromYear: 1984,
        toYear: 2012,
        quality: 3,
        name: 'Landsat 4-5, tier 2',
        shortName: 'L4-5 T2'
    },
    sentinel2: {
        fromYear: 2015,
        quality: 1,
        name: 'Sentinel 2',
        shortName: 'S2'
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