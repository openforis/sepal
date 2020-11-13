const ee = require('ee')
const {map, switchMap, toArray} = require('rx/operators')
const {calculateIndex} = require('sepal/ee/optical/indexes')
const imageFactory = require('sepal/ee/imageFactory')
const {concat, of, zip} = require('rx')
const _ = require('lodash')
const recipeRef = require('sepal/ee/recipeRef')

const classify =
    ({
         model: {
             inputImagery: {images: imageRecipes},
             legend,
             trainingData: {dataSets},
             auxiliaryImagery = [],
             scale
         }
     }) => {
        const recipeTrainingData$ = zip(...dataSets
            .filter(({type}) => type === 'RECIPE')
            .map(({recipe}) => {
                return recipeRef({id: recipe}).getRecipe$().pipe(
                    switchMap(recipe => recipe.getTrainingData$())
                )
            })
        ).pipe(
            map(trainingDataSets => ee.FeatureCollection(trainingDataSets).flatten())
        )
        const referenceData = dataSets
            .filter(({type}) => type !== 'RECIPE')
            .map(({referenceData}) => referenceData)
            .flat()
        const toFeature = plot => {
            return ee.Feature(ee.Geometry.Point([plot['x'], plot['y']]), {'class': plot['class']})
        }
        const referenceDataCollection = ee.FeatureCollection(referenceData.map(toFeature))
        const images$ = zip(
            ...imageRecipes.map(recipe => toImage$(recipe, auxiliaryImagery))
        )
        const getTrainingData$ = () => {
            return images$.pipe(
                switchMap(images =>
                    concat(
                        recipeTrainingData$,
                        of(referenceDataCollection).pipe(
                            map(referenceDataCollection => {
                                const imageToClassify = ee.Image(images)
                                return imageToClassify.sampleRegions({
                                    collection: referenceDataCollection,
                                    properties: ['class'],
                                    scale: scale || 1
                                })
                            })
                        )
                    ).pipe(
                        toArray(),
                        map(trainingDataSets => ee.FeatureCollection(trainingDataSets).flatten())
                    )
                )
            )
        }
        return {
            getTrainingData$,
            getImage$() {
                return getTrainingData$().pipe(
                    switchMap(trainingData =>
                        images$.pipe(
                            map(images => {
                                const imageToClassify = ee.Image(images)
                                const classifier = ee.Classifier.smileRandomForest(25)
                                    .train(trainingData.set('band_order', imageToClassify.bandNames()), 'class')
                                return imageToClassify
                                    .classify(classifier.setOutputMode('CLASSIFICATION'))
                                    .uint8()
                                    .rename(['class'])
                            })
                        )
                    )
                )
            },
            getVisParams$() {
                const sortedLegend = _.sortBy(legend.entries, 'value')
                const min = sortedLegend[0].value
                const max = _.last(sortedLegend).value
                const palette = sortedLegend.map(({color}) => color)
                return of({min, max, palette})
            },
            getGeometry$() {
                return images$.pipe(
                    map(images => ee.ImageCollection(images).geometry(scale))
                )
            }
        }
    }

const toImage$ = (recipe, auxiliaryImagery) =>
    imageFactory(recipe).getImage$().pipe(
        map(image => addCovariates(image, recipe.bandSetSpecs, auxiliaryImagery))
    )

const addCovariates = (image, bandSetSpecs, auxiliaryImagery) => {
    return ee.Image(
        bandSetSpecs.map(({type, included, operation}) => {
            switch (type) {
                case 'IMAGE_BANDS':
                    return image.selectExisting(included)
                case 'PAIR_WISE_EXPRESSION':
                    return combinePairwise(image, included, operation)
                case 'INDEXES':
                    return calculateIndexes(image, included)
            }
        })
    ).addBands(
        auxiliaryImagery.length && getAuxiliaryImagery(auxiliaryImagery)
    ).updateMask(
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
        .addBands(eastness)
        .addBands(northness)
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
        .addBands(transitionMasks)
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
        indexNames.map(indexName =>
            calculateIndex(image, indexName)
        )
    )

const flushCache = features =>
    features.map(feature => feature
        .set('__flush_cache__', Math.random())
        .copyProperties(feature)
    )

const colors = [
    'FFB300',  // Vivid Yellow
    '803E75',  // Strong Purple
    'FF6800',  // Vivid Orange
    'A6BDD7',  // Very Light Blue
    'C10020',  // Vivid Red
    'CEA262',  // Grayish Yellow
    '817066',  // Medium Gray
    '007D34',  // Vivid Green
    'F6768E',  // Strong Purplish Pink
    '00538A',  // Strong Blue
    'FF7A5C',  // Strong Yellowish Pink
    '53377A',  // Strong Violet
    'FF8E00',  // Vivid Orange Yellow
    'B32851',  // Strong Purplish Red
    'F4C800',  // Vivid Greenish Yellow
    '7F180D',  // Strong Reddish Brown
    '93AA00',  // Vivid Yellowish Green
    '593315',  // Deep Yellowish Brown
    'F13A13',  // Vivid Reddish Orange
    '232C16'  // Dark Olive Green
]

module.exports = classify
