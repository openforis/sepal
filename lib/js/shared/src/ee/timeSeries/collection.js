const {toGeometry} = require('#sepal/ee/aoi')
const {allScenes: createOpticalCollection} = require('#sepal/ee/optical/collection')
const {createCollection: createRadarCollection} = require('#sepal/ee/radar/collection')
const {createCollection: createPlanetCollection} = require('#sepal/ee/planet/collection')
const {calculateIndex, supportedIndexes} = require('#sepal/ee/optical/indexes')
const addTasseledCap = require('#sepal/ee/optical/addTasseledCap')
const {of, map, switchMap} = require('rxjs')
const ee = require('#sepal/ee')
const recipeRef = require('#sepal/ee/recipeRef')
const _ = require('lodash')

module.exports = {
    getCollection$: ({recipe, geometry: geo, startDate: sd, endDate: ed, bands}) => {
        const geometry = geo || toGeometry(recipe.model.aoi)
        const startDate = sd || recipe.model.dates.startDate
        const endDate = ed || recipe.model.dates.endDate
        const dataSets = recipe.model.sources.dataSets
        const cloudPercentageThreshold = recipe.model.sources.cloudPercentageThreshold
        const classification = recipe.model.sources.classification
        const surfaceReflectance = recipe.model.options.corrections?.includes('SR')
        const brdfCorrect = recipe.model.options.corrections?.includes('BRDF')
        const calibrate = true
        const {
            cloudDetection, cloudMasking, cloudBuffer, shadowMasking, snowMasking,  // Optical
            orbits, geometricCorrection, outlierRemoval, orbitNumbers, spatialSpeckleFilter, // Radar
            kernelSize, sigma, strongScattererValues, snicSize, snicCompactness,  // Radar
            multitemporalSpeckleFilter, numberOfImages, minNumberOfImages, mask, minAngle, maxAngle, minObservations, // Radar
            histogramMatching
        } = recipe.model.options

        const opticalImages = (classificationRecipe, trainingData) => {
            const collection = createOpticalCollection({
                geometry,
                dataSets: extractDataSets(dataSets),
                reflectance,
                histogramMatching,
                filters: [],
                cloudPercentageThreshold,
                cloudDetection,
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

            const addClassificationBands = image => {
                if (classificationRecipe) {
                    const classification = classificationRecipe.classifyImage(image, bands, trainingData)
                    const regression = scale(classification.selectExisting(['regression']), 1000)
                    const probabilityBands = bands.filter(band => band.startsWith('probability_'))
                    const probabilities = scale(classification.selectExisting(probabilityBands), 100)
                    return image
                        .addBands(regression)
                        .addBands(probabilities)
                } else {
                    return image
                }
            }

            const processImage = image => {
                const bandsToInclude = classificationRecipe
                    ? [
                        ...bands,
                        ...['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'],
                        ...supportedIndexes()
                    ]
                    : bands
                const indexes = ee.Image(
                    bandsToInclude.filter(band => supportedIndexes().includes(band))
                        .map(indexName => scale(calculateIndex(image, indexName), 10000))
                )
                return addClassificationBands(
                    addTasseledCap(image, bandsToInclude)
                        .addBands(indexes, null, true)
                )
                    .select(bands)
                    .int16()
                    .clip(geometry)
                    .set('date', image.date().format('yyyy-MM-dd'))
            }

            return collection.map(processImage)
        }

        const radarImages = (classificationRecipe, trainingData) => {
            const collection = createRadarCollection({
                startDate, endDate, targetDate: startDate, geometry,
                orbits, geometricCorrection, outlierRemoval, orbitNumbers, spatialSpeckleFilter,
                kernelSize, sigma, strongScattererValues, snicSize, snicCompactness, multitemporalSpeckleFilter, numberOfImages, minNumberOfImages, mask, minAngle, maxAngle, minObservations
            })

            const processImage = image => {
                if (classificationRecipe) {
                    image = image.addBands(
                        classificationRecipe.classifyImage(image, bands, trainingData),
                        null, true
                    )
                }
                if (bands.includes('ratio_VV_VH')) {
                    image = image
                        .addBands(
                            image.select('VV').divide(image.select('VH')).rename('ratio_VV_VH')
                        )
                }
                return image
                    .addBands(
                        scale(image.selectExisting(['VV', 'VH']), 100),
                        null, true
                    )
                    .addBands(
                        scale(image.selectExisting(['ratio_VV_VH']), 1000),
                        null, true
                    )
                    .int16()
                    .set('date', image.date().format('yyyy-MM-dd'))
            }

            return collection.map(processImage)
        }

        const planetImages = (classificationRecipe, trainingData) => {
            const cloudThreshold = cloudMasking === 'MODERATE' ? 0 : 80
            const sources = recipe.model.sources
            const collection = createPlanetCollection({
                startDate,
                endDate,
                geometry,
                sources: {...sources, source: Object.values(sources.dataSets).flat()[0]},
                histogramMatching,
                cloudThreshold,
                cloudBuffer
            })

            const processImage = image => {
                if (classificationRecipe) {
                    image = image.addBands(
                        classificationRecipe.classifyImage(image, bands, trainingData),
                        null, true
                    )
                }

                const bandsToInclude = classificationRecipe
                    ? [
                        ...bands,
                        ...supportedIndexes()
                    ]
                    : bands
                const indexes = ee.Image(
                    bandsToInclude.filter(band => supportedIndexes().includes(band))
                        .map(indexName => scale(calculateIndex(image, indexName), 10000))
                )
                return image
                    .addBands(indexes, null, true)
                    .select(bands)
                    .int16()
                    .clip(geometry)
                    .set('date', image.date().format('yyyy-MM-dd'))
            }
            return collection.map(processImage)
        }
        const isRadar = () => _.isEqual(Object.values(dataSets).flat(), ['SENTINEL_1'])
        const isOptical = () => Object.keys(dataSets).find(type => ['LANDSAT', 'SENTINEL_2'].includes(type))

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
                            : isOptical()
                                ? opticalImages(classificationRecipe, trainingData)
                                : planetImages(classificationRecipe, trainingData)
                    }
                    )
                )
            }
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
