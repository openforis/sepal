const {toGeometry} = require('sepal/ee/aoi')
const {allScenes: createOpticalCollection} = require('sepal/ee/optical/collection')
const {createCollection: createRadarCollection} = require('sepal/ee/radar/collection')
const {calculateIndex, supportedIndexes} = require('sepal/ee/optical/indexes')
const addTasseledCap = require('sepal/ee/optical/addTasseledCap')
const {of, throwError} = require('rx')
const {map, switchMap} = require('rx/operators')
const ee = require('ee')
const recipeRef = require('sepal/ee/recipeRef')
const _ = require('lodash')

module.exports = {
    getCollection$: ({recipe, geometry: geo, startDate: sd, endDate: ed, bands}) => {
        const geometry = geo || toGeometry(recipe.model.aoi)
        const startDate = sd || recipe.model.dates.startDate
        const endDate = ed || recipe.model.dates.endDate
        const dataSets = recipe.model.sources.dataSets
        const classification = recipe.model.sources.classification
        const surfaceReflectance = recipe.model.options.corrections.includes('SR')
        const brdfCorrect = recipe.model.options.corrections.includes('BRDF')
        const calibrate = true
        const {
            cloudMasking, cloudBuffer, shadowMasking, snowMasking,  // Optical
            orbits, geometricCorrection, speckleFilter, outlierRemoval // Radar
        } = recipe.model.options

        const opticalImages = (classificationRecipe, trainingData) => {
            const collection = createOpticalCollection({
                geometry,
                dataSets: extractDataSets(dataSets),
                reflectance,
                filters: [],
                cloudMasking,
                cloudBuffer,
                shadowMasking,
                snowMasking,
                panSharpen: false,
                calibrate,
                brdfCorrect,
                dates: {
                    seasonStart: startDate,
                    seasonEnd: endDate
                }
            })

            const processImage = image => {
                if (classificationRecipe) {
                    const classification = classificationRecipe.classifyImage(image, bands, trainingData)
                    const regression = scale(classification.selectExisting(['regression']), 1000)
                    const probabilityBands = bands.filter(band => band.startsWith('probability_'))
                    const probabilities = scale(classification.selectExisting(probabilityBands), 100)
                    image = image
                        .addBands(regression)
                        .addBands(probabilities)
                }
                const indexes = ee.Image(
                    bands.filter(band => supportedIndexes().includes(band))
                        .map(indexName => scale(calculateIndex(image, indexName), 10000))
                )
                return addTasseledCap(image, bands)
                    .addBands(indexes)
                    .select(bands)
                    .int16()
                    .clip(geometry)
                    .set('date', image.date().format('yyyy-MM-dd'))
            }

            return collection.map(processImage)
        }

        const radarImages = (classificationRecipe, trainingData) => {
            const collection = createRadarCollection({
                startDate,
                endDate,
                targetDate: startDate,
                geometry,
                orbits,
                geometricCorrection,
                speckleFilter,
                outlierRemoval
            })

            const processImage = image => {
                if (classificationRecipe) {
                    image = image.addBands(classificationRecipe.classifyImage(image, bands, trainingData))
                }
                if (bands.includes('ratio_VV_VH')) {
                    image = image
                        .addBands(
                            image.select('VV').divide(image.select('VH')).rename('ratio_VV_VH')
                        )
                }
                return image
                    .addBands(
                        scale(image.selectExisting(['VV', 'VH', 'ratio_VV_VH']), 100),
                        null, true
                    )
                    .int16()
                    .set('date', image.date().format('yyyy-MM-dd'))
            }

            return collection.map(processImage)
        }

        const isRadar = () => _.isEqual(Object.values(dataSets).flat(), ['SENTINEL_1'])

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

        const classificationRecipe$ = classification
            ? recipeRef({id: classification}).getRecipe$()
            : of(null)
        const reflectance = surfaceReflectance ? 'SR' : 'TOA'

        return classificationRecipe$.pipe(
            switchMap(classificationRecipe => {
                return (classificationRecipe
                    ? classificationRecipe.getTrainingData$()
                    : of(null)).pipe(
                    map(trainingData => {
                        return isRadar()
                            ? radarImages(classificationRecipe, trainingData)
                            : opticalImages(classificationRecipe, trainingData)
                    }
                    )
                )
            }
            ),
            switchMap(collection =>
                ee.getInfo$(
                    collection.isEmpty(),
                    'check if collection is empty'
                ).pipe(
                    switchMap(emptyCollection =>
                        emptyCollection
                            ? throwError(new Error('There is no imagery to process.'))
                            : of(collection)
                    )
                )
            )
        )
    }
}

const scale = (image, factor) =>
    image.multiply(
        ee.ImageCollection(
            ee.List.repeat(ee.Image(factor), image.bandNames().size())
        ).toBands()
    )
