const ee = require('#sepal/ee/ee')
const {concat, defer, of, zip, map, switchMap, toArray} = require('rxjs')
const {calculateIndex} = require('#sepal/ee/optical/indexes')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')
const recipeRef = require('#sepal/ee/recipeRef')

const NORMALIZE_MAX_PIXELS = 1e6

const classify =
    ({
        model: {
            inputImagery: {images: imageRecipes},
            trainingData: {dataSets},
            auxiliaryImagery = [],
            classifier: classifierConfig,
            scale
        }
    }) => {
        const normalizeImage = image => {
            const minMax = image.reduceRegion({
                reducer: ee.Reducer.minMax(),
                scale: scale || 30,
                bestEffort: true,
                maxPixels: NORMALIZE_MAX_PIXELS,
                tileScale: 16
            })
            return ee.Image(ee.Image(
                image.bandNames().iterate((bandName, acc) => {
                    bandName = ee.String(bandName)
                    const min = minMax.getNumber(bandName.cat('_min'))
                    const max = minMax.getNumber(bandName.cat('_max'))
                    const band = image.select(bandName)
                    const scaled = ee.Image(ee.Algorithms.If(
                        min.eq(max),
                        band.divide(max),
                        unitScale(band, min, max)
                    ))
                    return ee.Image(acc).addBands(scaled, null, true)
                }, ee.Image([]))
            )
                .clip(image.geometry())
                .copyProperties(image, image.propertyNames()))
        }

        const recipeTrainingData$ = () => zip(...dataSets
            .filter(({type}) => type === 'RECIPE')
            .map(({recipe}) =>
                recipeRef({id: recipe}).getRecipe$().pipe(
                    switchMap(recipe => recipe.getTrainingData$())
                ))
        ).pipe(
            map(trainingDataSets => ee.FeatureCollection(trainingDataSets).flatten())
        )
        const referenceData = dataSets
            .filter(({type}) => type !== 'RECIPE')
            .map(({referenceData}) => referenceData)
            .flat()
        const toFeature = referencePoint => {
            return ee.Feature(ee.Geometry.Point([referencePoint['x'], referencePoint['y']]), {'value': referencePoint['value']})
        }
        const referenceDataCollection = ee.FeatureCollection(referenceData.map(toFeature))
        const imageToClassify$ = defer(() => zip(
            ...imageRecipes.map(recipe => toImage$(recipe, auxiliaryImagery))
        )).pipe(
            map(images => ee.Image(images)),
            map(imageToClassify => classifierConfig.type === 'GRADIENT_TREE_BOOST'
                ? normalizeImage(imageToClassify)
                : imageToClassify)
        )

        const getTrainingData$ = bands => {
            return imageToClassify$.pipe(
                switchMap(imageToClassify =>
                    concat(
                        recipeTrainingData$(),
                        of(referenceDataCollection).pipe(
                            map(referenceDataCollection =>
                                imageToClassify.sampleRegions({
                                    collection: referenceDataCollection.filterBounds(imageToClassify.geometry()),
                                    properties: ['value'],
                                    scale: scale || 1,
                                    tileScale: 16
                                }))
                        )
                    ).pipe(
                        toArray(),
                        map(trainingDataSets =>
                            ee.FeatureCollection(trainingDataSets)
                                .flatten()
                                .set('band_order', bands || imageToClassify.bandNames())
                        )
                    )
                )
            )
        }

        const createRegression = ({trainingData, imageToClassify}) => {
            const classifier = createClassifier(classifierConfig)
                .train(trainingData, 'value')
                .setOutputMode('REGRESSION')
            return imageToClassify
                .classify(classifier)
                .float()
                .rename(['regression'])
        }

        return {
            getTrainingData$,
            getImage$() {
                return imageToClassify$.pipe(
                    switchMap(imageToClassify => {
                        return getTrainingData$(imageToClassify.bandNames()).pipe(
                            map(trainingData => createRegression({trainingData, imageToClassify}))
                        )
                    })
                )
            },
            getBands$() {
                return of(['regression'])
            },
            getGeometry$() {
                return imageFactory(imageRecipes[0]).getGeometry$()
            }
        }
    }

const toImage$ = (recipe, auxiliaryImagery) =>
    imageFactory(recipe).getImage$().pipe(
        map(image => addCovariates(image, recipe.bandSetSpecs, auxiliaryImagery))
    )

const addCovariates = (image, bandSetSpecs, auxiliaryImagery) => {
    const bandSetSpecsImages = bandSetSpecs.map(({type, included, operation}) => {
        switch (type) {
        case 'IMAGE_BANDS':
            return image.selectExisting(included).addBands(
                calculateIndexes(image, included), null, true
            )
        case 'PAIR_WISE_EXPRESSION':
            return combinePairwise(image, included, operation)
        case 'INDEXES':
            return calculateIndexes(image, included)
        }
    })
    return _.tail(bandSetSpecsImages)
        .reduce((acc, image) => acc.addBands(image, null, true), _.head(bandSetSpecsImages))
        .addBands(
            auxiliaryImagery.length
                ? getAuxiliaryImagery(auxiliaryImagery)
                : ee.Image([]),
            null, true
        )
        .updateMask(
            image.mask().reduce(ee.Reducer.max())
        )

}

const getAuxiliaryImagery = auxiliaryImagery =>
    ee.Image(
        auxiliaryImagery.map(type => {
            switch (type) {
            case 'LATITUDE':
                return createLatitudeImage()
            case 'TERRAIN':
                return createTerrainImage()
            case 'WATER':
                return createSurfaceWaterImage()
            }
        })
    )

const createLatitudeImage = () =>
    ee.Image.pixelLonLat().select('latitude').float()

const createTerrainImage = () => {
    const elevation = ee.Image('USGS/SRTMGL1_003')
    const topography = ee.Algorithms.Terrain(elevation)
    const aspectRad = topography.select(['aspect']).multiply(ee.Number(Math.PI).divide(180))
    const eastness = aspectRad.sin().rename(['eastness']).float()
    const northness = aspectRad.cos().rename(['northness']).float()
    return topography.select(['elevation', 'slope', 'aspect'])
        .addBands(eastness, null, true)
        .addBands(northness, null, true)
}

const createSurfaceWaterImage = () => {
    const water = ee.Image('JRC/GSW1_0/GlobalSurfaceWater').unmask()
    const transitions = [
        'no_change',
        'permanent',
        'new_permanent',
        'lost_permanent',
        'seasonal',
        'new_seasonal',
        'lost_seasonal',
        'seasonal_to_permanent',
        'permanent_to_seasonal',
        'ephemeral_permanent',
        'ephemeral_seasonal'
    ]
    const transitionMasks = ee.Image(
        transitions.map((transition, i) =>
            water.select('transition').eq(i).rename(`water_${transition}`))
    )

    return water
        .select(
            ['occurrence', 'change_abs', 'change_norm', 'seasonality', 'max_extent'],
            ['water_occurrence', 'water_change_abs', 'water_change_norm', 'water_seasonality', 'water_max_extent']
        )
        .addBands(transitionMasks, null, true)
}

const combinePairwise = (image, bands, operation) => {
    const operations = {
        RATIO: 'b1 / b2',
        NORMALIZED_DIFFERENCE: '(b1 - b2) / (b1 + b2)',
        DIFFERENCE: 'b1 - b2',
        DISTANCE: 'atan2(b1, b2) / PI',
        ANGLE: 'hypot(b1, b2)'
    }
    return image
        .selectExisting(bands)
        .combinePairwise(operations[operation], `_${operation.toLowerCase()}`)
}

const calculateIndexes = (image, indexNames) =>
    ee.Image(
        indexNames.map(indexName => calculateIndex(image, indexName))
    )

const createClassifier = ({type, ...config}) => {
    const randomForest = ({numberOfTrees, variablesPerSplit, minLeafPopulation, bagFraction, maxNodes, seed}) =>
        ee.Classifier.smileRandomForest({
            numberOfTrees: toInt(numberOfTrees),
            variablesPerSplit: toInt(variablesPerSplit),
            minLeafPopulation: toInt(minLeafPopulation),
            bagFraction: toFloat(bagFraction),
            maxNodes: toInt(maxNodes),
            seed: toInt(seed)
        })

    const gradientTreeBoost = ({numberOfTrees, shrinkage, samplingRate, maxNodes, loss, seed}) => {
        return ee.Classifier.smileGradientTreeBoost({
            numberOfTrees: toInt(numberOfTrees),
            shrinkage: toFloat(shrinkage),
            samplingRate: toFloat(samplingRate),
            maxNodes: toInt(maxNodes),
            loss,
            seed: toInt(seed)
        })
    }

    const cart = ({minLeafPopulation, maxNodes}) =>
        ee.Classifier.smileCart({
            minLeafPopulation: toInt(minLeafPopulation),
            maxNodes: toInt(maxNodes)
        })

    switch (type) {
    case 'RANDOM_FOREST':
        return randomForest(config)
    case 'GRADIENT_TREE_BOOST':
        return gradientTreeBoost(config)
    case 'CART':
        return cart(config)
    }
}

const toInt = input => {
    input = _.isString(input) ? input : _.toString(input)
    const parsed = parseInt(input)
    return _.isFinite(parsed) ? parsed : null
}

const toFloat = input => {
    input = _.isString(input) ? input : _.toString(input)
    const parsed = parseFloat(input)
    return _.isFinite(parsed) ? parsed : null
}

const unitScale = (image, low, high) =>
    image
        .subtract(low)
        .divide(ee.Number(high).subtract(low))

module.exports = classify
