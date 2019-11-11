const ee = require('@google/earthengine')

const allScenes = (
    {
        region,
        dates: {
            targetDate = null,
            seasonStart = null,
            seasonEnd = null,
            yearsBefore = 0,
            yearsAfter = 0
        } = {},
        dataSets,
        reflectance = 'TOA',
        compositeOptions: {
            corrections = [],
            mask = null,
            cloudBuffer = null
        } = {}
    }) => {
    const filter = ee.Filter.and(
        ee.Filter.bounds(region),
        ee.Filter.date('2018-07-01', '2018-08-01')
    )
    return dataSets.reduce((mergedCollection, dataSet) =>
        mergeImageCollections(
            mergedCollection,
            toCollection({dataSet, reflectance, filter})
        ),
    ee.ImageCollection([])
    )
}

const mergeImageCollections = (c1, c2) =>
    ee.ImageCollection(c1.merge(c2))

const toCollection = ({dataSet, reflectance, filter}) => {
    const spec = specByDataSet(reflectance)[dataSet]
    const fromBands = Object.values(spec.bands)
    const toBands = Object.keys(spec.bands)
    return ee.ImageCollection(spec.name)
        .filter(filter)
        .map(image => image
            .multiply(spec.factor) // TODO: Different factors for different bands?
            .select(fromBands, toBands)
        )
}

const specByDataSet = reflectance => ({
    TOA: {
        LANDSAT_4: {
            name: 'LANDSAT/LT04/C01/T1_TOA',
            factor: 10000,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                BQA: 'BQA'
            }

        },
        LANDSAT_4_T2: {
            name: 'LANDSAT/LT04/C01/T2_TOA',
            factor: 10000,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                BQA: 'BQA'
            }
        },
        LANDSAT_5: {
            name: 'LANDSAT/LT05/C01/T1_TOA',
            factor: 10000,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                BQA: 'BQA'
            }
        },
        LANDSAT_5_T2: {
            name: 'LANDSAT/LT05/C01/T2_TOA',
            factor: 10000,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                BQA: 'BQA'
            }
        },
        LANDSAT_7: {
            name: 'LANDSAT/LE07/C01/T1_TOA',
            factor: 10000,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6_VCID_1',
                thermal2: 'B6_VCID_2',
                swir2: 'B7',
                pan: 'B8',
                BQA: 'BQA'
            }
        },
        LANDSAT_7_T2: {
            name: 'LANDSAT/LE07/C01/T2_TOA',
            factor: 10000,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6_VCID_1',
                thermal2: 'B6_VCID_2',
                swir2: 'B7',
                pan: 'B8',
                BQA: 'BQA'
            }
        },
        LANDSAT_8: {
            name: 'LANDSAT/LC08/C01/T1_TOA',
            factor: 10000,
            bands: {
                aerosol: 'B1',
                blue: 'B2',
                green: 'B3',
                red: 'B4',
                nir: 'B5',
                swir1: 'B6',
                swir2: 'B7',
                pan: 'B8',
                cirrus: 'B9',
                thermal: 'B10',
                thermal2: 'B11',
                BQA: 'BQA'
            }
        },
        LANDSAT_8_T2: {
            name: 'LANDSAT/LC08/C01/T2_SR',
            factor: 10000,
            bands: {
                aerosol: 'B1',
                blue: 'B2',
                green: 'B3',
                red: 'B4',
                nir: 'B5',
                swir1: 'B6',
                swir2: 'B7',
                pan: 'B8',
                cirrus: 'B9',
                thermal: 'B10',
                thermal2: 'B11',
                BQA: 'BQA'
            }
        },
        SENTINEL_2: {
            name: 'COPERNICUS/S2',
            factor: 1,
            bands: {
                aerosol: 'B1',
                blue: 'B2',
                green: 'B3',
                red: 'B4',
                redEdge1: 'B5',
                redEdge2: 'B6',
                redEdge3: 'B7',
                nir: 'B8',
                redEdge4: 'B8A',
                waterVapor: 'B9',
                swir1: 'B11',
                swir2: 'B12',
            }
        }
    },
    SR: {
        LANDSAT_4: {
            name: 'LANDSAT/LT04/C01/T1_SR',
            factor: 1,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                pixel_qa: 'pixel_qa'
            }
        },
        LANDSAT_4_T2: {
            name: 'LANDSAT/LT04/C01/T2_SR',
            factor: 1,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                pixel_qa: 'pixel_qa'
            }
        },
        LANDSAT_5: {
            name: 'LANDSAT/LT05/C01/T1_SR',
            factor: 1,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                pixel_qa: 'pixel_qa'
            }
        },
        LANDSAT_5_T2: {
            name: 'LANDSAT/LT05/C01/T2_SR',
            factor: 1,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                pixel_qa: 'pixel_qa'
            }
        },
        LANDSAT_7: {
            name: 'LANDSAT/LE07/C01/T1_SR',
            factor: 1,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                pan: 'B8',
                pixel_qa: 'pixel_qa'
            }
        },
        LANDSAT_7_T2: {
            name: 'LANDSAT/LE07/C01/T2_SR',
            factor: 1,
            bands: {
                blue: 'B1',
                green: 'B2',
                red: 'B3',
                nir: 'B4',
                swir1: 'B5',
                thermal: 'B6',
                swir2: 'B7',
                pixel_qa: 'pixel_qa'
            }
        },
        LANDSAT_8: {
            name: 'LANDSAT/LC08/C01/T1_SR',
            factor: 1,
            bands: {
                aerosol: 'B1',
                blue: 'B2',
                green: 'B3',
                red: 'B4',
                nir: 'B5',
                swir1: 'B6',
                swir2: 'B7',
                thermal: 'B10',
                thermal2: 'B11',
                pixel_qa: 'pixel_qa'
            }
        },
        LANDSAT_8_T2: {
            name: 'LANDSAT/LC08/C01/T2_SR',
            factor: 1,
            bands: {
                aerosol: 'B1',
                blue: 'B2',
                green: 'B3',
                red: 'B4',
                nir: 'B5',
                swir1: 'B6',
                swir2: 'B7',
                thermal: 'B10',
                thermal2: 'B11',
                pixel_qa: 'pixel_qa'
            }
        },
        SENTINEL_2: {
            name: 'COPERNICUS/S2_SR',
            factor: 1,
            bands: {
                aerosol: 'B1',
                blue: 'B2',
                green: 'B3',
                red: 'B4',
                redEdge1: 'B5',
                redEdge2: 'B6',
                redEdge3: 'B7',
                nir: 'B8',
                redEdge4: 'B8A',
                waterVapor: 'B9',
                swir1: 'B11',
                swir2: 'B12',
            }
        }
    }
}[reflectance])

const selectedScenes = ({}) => {
}

module.exports = {allScenes, selectedScenes}
