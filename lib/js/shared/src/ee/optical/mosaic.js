const {of, throwError, map} = require('rxjs')
const {calculateIndex, supportedIndexes} = require('#sepal/ee/optical/indexes')
const {toGeometry$} = require('#sepal/ee/aoi')
const {allScenes, findCommonBands, selectedScenes} = require('#sepal/ee/optical/collection')
const {toComposite} = require('#sepal/ee/optical/composite')
const addTasseledCap = require('#sepal/ee/optical/addTasseledCap')
const moment = require('moment')
const _ = require('lodash')
const visParams = require('./visParams')
const {migrate} = require('#sepal/recipe/migrate')
const {validateEEImage} = require('#sepal/ee/validate')

const canPanSharpen = selectedBands =>
    _.chain(selectedBands)
        .difference(['blue', 'green', 'red', 'nir'])
        .isEmpty()
        .value()

module.exports = (recipe, {selection: selectedBands, panSharpen} = {selection: []}) =>
    mosaic(recipe, selectedBands, panSharpen && canPanSharpen(selectedBands))

const mosaic = (recipe, selectedBands, panSharpen) => {
    recipe = migrate(recipe)
    const model = recipe.model
    const dataSets = extractDataSets(model.sources.dataSets)
    const cloudPercentageThreshold = model.sources.cloudPercentageThreshold
    const compositeOptions = model.compositeOptions
    const composingMethod = compositeOptions.compose
    const corrections = compositeOptions.corrections
    const surfaceReflectance = corrections.includes('SR')
    const reflectance = surfaceReflectance ? 'SR' : 'TOA'

    const addIndexes = image =>
        selectedBands
            .filter(band => supportedIndexes().includes(band))
            .reduce(
                (acc, indexName) => acc.addBands(
                    calculateIndex(image, indexName)
                        .multiply(10000)
                        .int16()
                ),
                image
            )

    const getImage$ = () => {
        const calibrate = corrections.includes('CALIBRATE')
        const brdfCorrect = corrections.includes('BRDF')
        const dates = model.dates
        const targetDate = dates.targetDate
        const useAllScenes = !model.sceneSelectionOptions || model.sceneSelectionOptions.type === 'ALL'

        return toGeometry$(model.aoi).pipe(
            map(geometry => {
                const collection = useAllScenes
                    ? allScenes({
                        geometry,
                        dataSets,
                        cloudPercentageThreshold,
                        reflectance,
                        ...compositeOptions,
                        panSharpen,
                        calibrate,
                        brdfCorrect,
                        dates
                    })
                    : selectedScenes({
                        geometry,
                        reflectance,
                        calibrate,
                        brdfCorrect,
                        ...compositeOptions,
                        panSharpen,
                        targetDate,
                        scenes: extractScenes(model.scenes)
                    })
                const mosaic = toComposite({collection, composingMethod})
                const image = addTasseledCap(addIndexes(mosaic), selectedBands)
                    .select(selectedBands.length > 0 ? _.uniq(selectedBands) : '.*')
                    .clip(geometry)
                return validateEEImage({
                    valid: collection.limit(1).size(),
                    image,
                    error: {
                        userMessage: {
                            message: 'All images have been filtered out. Update the recipe to ensure at least one image is included.',
                            key: 'process.mosaic.error.noImages'
                        },
                        statusCode: 400
                    }
                })
            })
        )
    }

    return {
        getImage$,
        getBands$() {
            return of([
                ...findCommonBands(dataSets, reflectance)
                    .filter(band =>
                        !['qa', 'unixTimeDays', 'dayOfYear', 'daysFromTarget', 'targetDayCloseness'].includes(band)
                    ),
                ...['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'],
                ...supportedIndexes(),
                ...composingMethod === 'MEDOID' ? ['unixTimeDays', 'dayOfYear', 'daysFromTarget'] : []
            ])
        },
        getVisParams$() {
            if (selectedBands.length === 1 && selectedBands[0] === 'unixTimeDays') {
                const {seasonStart, seasonEnd, yearsBefore, yearsAfter} = model.dates
                const startDays = Math.floor(moment(seasonStart).subtract(yearsBefore, 'years').valueOf() / 8.64e7)
                const endDays = Math.floor(moment(seasonEnd).add(yearsAfter, 'years').valueOf() / 8.64e7)
                return of({
                    'bands': 'unixTimeDays',
                    'min': startDays,
                    'max': endDays,
                    'palette': '00FFFF, 000099'
                })
            } else {
                const params = visParams[reflectance][selectedBands.join('|')]
                return params
                    ? of(params)
                    : throwError(() => new Error(`Unsupported band selection: ${selectedBands}`))
            }
        },
        getGeometry$() {
            return toGeometry$(model.aoi)
        }
    }
}

const toDataSets = dataSet =>
    dataSet === 'LANDSAT_TM'
        ? ['LANDSAT_4', 'LANDSAT_5']
        : dataSet === 'LANDSAT_TM_T2'
            ? ['LANDSAT_4_T2', 'LANDSAT_5_T2']
            : [dataSet]

const extractDataSets = dataSets =>
    Object.values(dataSets)
        .flat()
        .map(dataSet => toDataSets(dataSet))
        .flat()

const extractScenes = scenes =>
    scenes
        ? Object.values(scenes).flat()
            .map(scene => toDataSets(scene.dataSet).map(dataSet => ({...scene, dataSet})))
            .flat()
        : []

