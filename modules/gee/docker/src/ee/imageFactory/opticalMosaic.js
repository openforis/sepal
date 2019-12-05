const ee = require('@google/earthengine')
const {toGeometry} = require('@sepal/ee/aoi')
const {allScenes, selectedScenes} = require('@sepal/ee/optical/collection')
const {toMosaic} = require('@sepal/ee/optical/mosaic')
const _ = require('lodash')

const canPanSharpen = selectedBands =>
    _.chain(selectedBands)
        .difference(['blue', 'green', 'red', 'nir'])
        .isEmpty()
        .value()

module.exports = (recipe, {selection: selectedBands, panSharpen}) =>
    opticalMosaic(recipe, selectedBands, panSharpen && canPanSharpen(selectedBands))

const opticalMosaic = (recipe, selectedBands, panSharpen) => {
    const model = recipe.model
    const region = toGeometry(model.aoi)
    const dataSets = extractDataSets(model.sources)
    const compositeOptions = model.compositeOptions
    const corrections = compositeOptions.corrections
    const surfaceReflectance = corrections.includes('SR')
    const reflectance = surfaceReflectance ? 'SR' : 'TOA'
    const calibrate = corrections.includes('CALIBRATE')
    const brdfCorrect = corrections.includes('BRDF')
    const dates = model.dates
    const targetDate = dates.targetDate
    const useAllScenes = model.sceneSelectionOptions.type === 'ALL'
    const filters = compositeOptions.filters
    const cloudMasking = compositeOptions.cloudMasking
    const cloudBuffer = compositeOptions.cloudBuffer
    const snowMasking = compositeOptions.snowMasking
    const collection = useAllScenes
        ? allScenes({
            region,
            dataSets,
            reflectance,
            filters,
            cloudMasking,
            cloudBuffer,
            snowMasking,
            panSharpen,
            calibrate,
            brdfCorrect,
            dates
        })
        : selectedScenes({
            region,
            reflectance,
            calibrate,
            brdfCorrect,
            filters,
            cloudMasking,
            cloudBuffer,
            snowMasking,
            panSharpen,
            targetDate,
            scenes: model.scenes
        })
    const composingMethod = compositeOptions.compose
    return {
        getImage() {
            const mosaic = toMosaic({collection, composingMethod})
            return addTasseledCap(mosaic, selectedBands)
                .select(selectedBands.length > 0 ? selectedBands : '.*')
                .clip(region)
        },
        getVisParams() {
            if (selectedBands === 'unixTimeDays') {
                return null // [TODO]
            } else {
                return visParams[reflectance][selectedBands.join('|')]
            }
        }
    }
}

const addTasseledCap = (image, selectedBands) => {
    const opticalBands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
    const tasseledCapBands = ['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth']
    const tasseledCapBandsSelected = _.intersection(selectedBands, tasseledCapBands).length > 0
    if (!selectedBands.length || tasseledCapBandsSelected) {
        const coefs = ee.Array([
            [0.3037, 0.2793, 0.4743, 0.5585, 0.5082, 0.1863],
            [-0.2848, -0.2435, -0.5436, 0.7243, 0.0840, -0.1800],
            [0.1509, 0.1973, 0.3279, 0.3406, -0.7112, -0.4572],
            [-0.8242, 0.0849, 0.4392, -0.0580, 0.2012, -0.2768],
            [-0.3280, 0.0549, 0.1075, 0.1855, -0.4357, 0.8085],
            [0.1084, -0.9022, 0.4120, 0.0573, -0.0251, 0.0238]
        ])
        const arrayImage = image.select(opticalBands).divide(10000).toArray().toArray(1)
        return image.addBandsReplace(
            ee.Image(coefs)
                .matrixMultiply(arrayImage)
                .arrayProject([0])
                .arrayFlatten([tasseledCapBands])
                .multiply(10000)
                .int16()
        )
    } else {
        return image
    }

}

const extractDataSets = sources =>
    Object.values(sources)
        .flat()
        .map(dataSet =>
            dataSet === 'LANDSAT_TM'
                ? ['LANDSAT_4', 'LANDSAT_5']
                : dataSet === 'LANDSAT_TM_T2'
                ? ['LANDSAT_4_T2', 'LANDSAT_5_T2']
                : dataSet
        )
        .flat()

const visParams = {
    'TOA': {
        'red|green|blue': {
            'bands': 'red,green,blue',
            'min': '200, 400, 600',
            'max': '2400, 2200, 2400',
            'gamma': 1.2
        },
        'nir|red|green': {
            'bands': 'nir,red,green',
            'min': '500, 200, 400',
            'max': '5000, 2400, 2200'
        },
        'nir|swir1|red': {
            'bands': 'nir,swir1,red',
            'min': 0,
            'max': 5000,
            'gamma': 1.5
        },
        'swir2|nir|red': {
            'bands': 'swir2,nir,red',
            'min': '0, 500, 200',
            'max': '1800, 6000, 3500'
        },
        'swir2|swir1|red': {
            'bands': 'swir2,swir1,red',
            'min': '0, 500, 200',
            'max': '1800, 3000, 2400'
        },
        'swir2|nir|green': {
            'bands': 'swir2,nir,green',
            'min': '0, 500, 400',
            'max': '1800, 6000, 3500'
        },
        'brightness|greenness|wetness': {
            'bands': 'brightness,greenness,wetness',
            'min': '1000, -1000, -1800',
            'max': '7000, 1800, 3200'
        },
        'dayOfYear': {
            'bands': 'dayOfYear',
            'min': 0,
            'max': 366,
            'palette': '00FFFF, 000099'
        },
        'daysFromTarget': {
            'bands': 'daysFromTarget',
            'min': 0,
            'max': 183,
            'palette': '00FF00, FF0000'
        }
    },
    'SR': {
        'red|green|blue': {
            'bands': 'red,green,blue',
            'min': '300, 100, 0',
            'max': '2500, 2500, 2300',
            'gamma': 1.3
        },
        'nir|red|green': {
            'bands': 'nir,red,green',
            'min': '500, 200, 100',
            'max': '5000, 2400, 2500'
        },
        'nir|swir1|red': {
            'bands': 'nir,swir1,red',
            'min': 0,
            'max': '5000, 5000, 3000',
            'gamma': 1.3
        },
        'swir2|nir|red': {
            'bands': 'swir2,nir,red',
            'min': '100, 500, 300',
            'max': '2000, 6000, 2500'
        },
        'swir2|swir1|red': {
            'bands': 'swir2,swir1,red',
            'min': '100, 200, 300',
            'max': '3300, 4800, 3100'
        },
        'swir2|nir|green': {
            'bands': 'swir2,nir,green',
            'min': '100, 500, 400',
            'max': '3300, 7500, 3000'
        },
        'brightness|greenness|wetness': {
            'bands': 'brightness,greenness,wetness',
            'min': '1000, -1000, -1800',
            'max': '7000, 1800, 3200'
        },
        'dayOfYear': {
            'bands': 'dayOfYear',
            'min': 0,
            'max': 183,
            'palette': '00FFFF, 000099'
        },
        'daysFromTarget': {
            'bands': 'daysFromTarget',
            'min': 0,
            'max': 183,
            'palette': '00FF00, FF0000'
        }
    }
}
