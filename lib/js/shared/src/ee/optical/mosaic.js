const {of} = require('rx')
const {toGeometry} = require('sepal/ee/aoi')
const {allScenes, selectedScenes} = require('sepal/ee/optical/collection')
const {toComposite} = require('sepal/ee/optical/composite')
const addTasseledCap = require('sepal/ee/optical/addTasseledCap')
const _ = require('lodash')

const canPanSharpen = selectedBands =>
    _.chain(selectedBands)
        .difference(['blue', 'green', 'red', 'nir'])
        .isEmpty()
        .value()

module.exports = (recipe, {selection: selectedBands, panSharpen}) =>
    mosaic(recipe, selectedBands, panSharpen && canPanSharpen(selectedBands))

const mosaic = (recipe, selectedBands, panSharpen) => {
    const model = recipe.model
    const geometry = toGeometry(model.aoi)
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
            geometry,
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
        getImage$() {
            const mosaic = toComposite({collection, composingMethod})
            return of(
                addTasseledCap(mosaic, selectedBands)
                    .select(selectedBands.length > 0 ? selectedBands : '.*')
                    .clip(geometry)
            )
        },
        getVisParams$() {
            if (selectedBands === 'unixTimeDays') {
                return of() // [TODO]
            } else {
                return of(
                    visParams[reflectance][selectedBands.join('|')]
                )
            }
        },
        getGeometry$() {
            return of(geometry)
        }
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
