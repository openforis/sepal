const ee = require('#sepal/ee')
const {defer, of, zip, map} = require('rxjs')
const {calculateIndex} = require('#sepal/ee/optical/indexes')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')

const NORMALIZE_MAX_PIXELS = 1e6

const cluster =
    ({
        model: {
            inputImagery: {images: imageRecipes},
            sampling: {numberOfSamples, sampleScale},
            auxiliaryImagery = [],
            clusterer: clustererConfig,
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

        const getTrainingData = imageToClassify => {
            return imageToClassify.sample({
                region: imageToClassify.select(0).geometry(),
                scale: scale || sampleScale, // TODO: Is this what we want?
                projection: 'EPSG:4326',
                numPixels: numberOfSamples,
                tileScale: 16
            })
        }

        const imageToClassify$ = defer(() => zip(
            ...imageRecipes.map(recipe => toImage$(recipe, auxiliaryImagery))
        )).pipe(
            map(images => normalizeImage(ee.Image(images)))
        )

        const clusterImage = ({trainingData, imageToClassify}) => {
            const clusterer = createClusterer(clustererConfig)
                .train(trainingData, imageToClassify.bandNames())
            return imageToClassify.cluster(clusterer, 'class')
        }

        const remapClusters = (cluster, imageToClassify) => {
            var from = cluster
                .addBands(imageToClassify.select(0).rename('value'))
                .stratifiedSample({
                    numPoints: 1,
                    classBand: 'class',
                    region: imageToClassify.select(0).geometry(),
                    scale: scale || sampleScale
                })
                .sort('value')
                .aggregate_array('class')
          
            var to = ee.List.sequence(0, from.size().subtract(1))
            return cluster
                .remap({from: from, to: to})
                .rename('class')
        }

        return {
            getImage$() {
                return imageToClassify$.pipe(
                    map(imageToClassify => {
                        const trainingData = getTrainingData(imageToClassify)
                        const cluster = clusterImage({trainingData, imageToClassify})
                        return remapClusters(cluster, imageToClassify)
                    })
                )
            },
            getBands$() {
                return of(['class'])
            },
            getGeometry$() {
                return imageFactory(imageRecipes[0]).getGeometry$()
            }
        }
    }

const createClusterer = ({type, ...config}) => {
    switch (type) {
    case 'CASCADE_KMEANS':
        return cascadeKMeans(config)
    case 'KMEANS':
        return kMeans(config)
    case 'LVQ':
        return lvq(config)
    case 'XMEANS':
        return xMeans(config)
    default:
        throw Error('Unsupported clusterer type', type)
    }
}

const cascadeKMeans = config =>
    ee.Clusterer.wekaCascadeKMeans({
        minClusters: config.minNumberOfClusters,
        maxClusters: config.maxNumberOfClusters,
        restarts: config.restarts,
        init: !!config.init,
        distanceFunction: config.distanceFunction,
        maxIterations: config.maxIterations
    })

const kMeans = config =>
    ee.Clusterer.wekaKMeans({
        nClusters: config.numberOfClusters,
        init: config.init,
        canopies: config.canopies,
        maxCandidates: config.maxCandidates,
        periodicPruning: config.periodicPruning,
        minDensity: config.minDensity,
        t1: config.t1,
        t2: config.t2,
        distanceFunction: config.distanceFunction,
        maxIterations: config.maxIterations,
        preserveOrder: config.preserveOrder,
        fast: config.fast,
        seed: config.seed
    })

const lvq = config =>
    ee.Clusterer.wekaLVQ({
        numClusters: config.numberOfClusters,
        learningRate: config.learningRate,
        epochs: config.epochs,
        normalizeInput: config.normalizeInput
    })
const xMeans = config =>
    ee.Clusterer.wekaXMeans({
        minClusters: config.minNumberOfClusters,
        maxClusters: config.maxNumberOfClusters,
        maxIterations: config.maxIterationsOverall,
        maxKMeans: config.maxKMeans,
        maxForChildren: config.maxForChildren,
        useKD: config.useKD,
        cutoffFactor: config.cutoffFactor,
        distanceFunction: config.distanceFunction,
        seed: config.seed
    })

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

const unitScale = (image, low, high) =>
    image
        .subtract(low)
        .divide(ee.Number(high).subtract(low))

module.exports = cluster
