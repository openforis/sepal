import moment from 'moment'

export const sources = ['LANDSAT', 'SENTINEL_2']

export const imageSourceById = {
    LANDSAT: {
        dataSets: [
            'LANDSAT_8',
            'LANDSAT_7',
            'LANDSAT_TM',
            'LANDSAT_8_T2',
            'LANDSAT_7_T2',
            'LANDSAT_TM_T2'
        ]
    },
    SENTINEL_2: {
        dataSets: [
            'SENTINEL_2'
        ]
    }
}

export const dataSetById = {
    LANDSAT_8: {
        fromYear: 2013,
        quality: 1,
        name: 'Landsat 8',
        shortName: 'L8',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'aerosol', 'thermal'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'aerosol', 'pan', 'cirrus', 'thermal', 'thermal2'
            ]
        }
    },
    LANDSAT_7: {
        fromYear: 1999,
        quality: 2,
        name: 'Landsat 7',
        shortName: 'L7',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'pan', 'thermal', 'thermal2'
            ]
        }
    },
    LANDSAT_TM: {
        fromYear: 1982,
        toYear: 2012,
        quality: 2,
        name: 'Landsat 4-5',
        shortName: 'L4-5',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal'
            ]
        }
    },
    LANDSAT_8_T2: {
        fromYear: 2013,
        quality: 3,
        name: 'Landsat 8, tier 2',
        shortName: 'L8 T2',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'aerosol', 'thermal'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'aerosol', 'pan', 'cirrus', 'thermal', 'thermal2'
            ]
        }
    },
    LANDSAT_7_T2: {
        fromYear: 1999,
        quality: 3,
        name: 'Landsat 7, tier 2',
        shortName: 'L7 T2',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'pan', 'thermal', 'thermal2'
            ]
        }
    },
    LANDSAT_TM_T2: {
        fromYear: 1984,
        toYear: 2012,
        quality: 3,
        name: 'Landsat 4-5, tier 2',
        shortName: 'L4-5 T2',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal'
            ]
        }
    },
    SENTINEL_2: {
        fromYear: 2015,
        quality: 1,
        name: 'Sentinel 2',
        shortName: 'S2',
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'redEdge1', 'redEdge2', 'redEdge3', 'redEdge4',
                'aerosol', 'waterVapor', 'cirrus'
            ]
        }
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
        return !!imageSourceById[sourceId].dataSets.find(dataSetId =>
            isDataSetInDateRange(dataSetId, fromDate, toDate)
        )
}
