import _ from 'lodash'
import {concat, defer, map, of, switchMap, toArray, zip} from 'rxjs'

import {auxiliaryImage} from '#sepal/ee/auxiliaryImagery'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {calculateIndex} from '#sepal/ee/optical/indexes'
import recipeRef from '#sepal/ee/recipeRef'
import {classificationBands} from '#sepal/recipe/type/classification'

const NORMALIZE_MAX_PIXELS = 1e6

// The training collection's property holding the per-band range its features were scaled by, where they were.
const FEATURE_STATISTICS = 'feature_statistics'

// `selection` names the bands to build. `outputBands` names the bands an export wants back, in its order; the
// bands themselves are always built in one order.
const classify =
    ({model},
        {selection: selectedBands, outputBands} = {selection: []}
    ) => {
        const {
            inputImagery: {images: imageRecipes},
            legend,
            trainingData: {dataSets},
            auxiliaryImagery = [],
            classifier: classifierConfig,
            scale
        } = model
        const entries = (legend && legend.entries) || []
        const sortedLegend = _.sortBy(entries, 'value')

        const getBands = () => classificationBands(model).map(({name}) => name)

        const project = image => outputBands?.length ? image.select(outputBands) : image

        // SVM and minimum distance train on features scaled by the training imagery's per-band range, unless told not
        // to. The range is the transformation: carried on the training data (FEATURE_STATISTICS), it scales whatever
        // imagery the classifier is later applied to as it scaled the imagery trained on.
        const normalizes = ['MINIMUM_DISTANCE', 'SVM'].includes(classifierConfig.type) && classifierConfig.normalize !== 'NO'

        const featureStatistics = features => features.reduceRegion({
            reducer: ee.Reducer.minMax(),
            scale: scale || 30,
            bestEffort: true,
            maxPixels: NORMALIZE_MAX_PIXELS,
            tileScale: classifierConfig.tileScale || 1
        })

        // The features ready to train on or classify: the training imagery's own, its statistics with them.
        const prepared = features => {
            if (!normalizes) {
                return {image: features, statistics: null}
            }
            const statistics = featureStatistics(features)
            return {
                image: ee.Image(normalized(features, statistics)
                    .clip(features.geometry())
                    .copyProperties(features, features.propertyNames())),
                statistics
            }
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
        const toFeature = plot => {
            return ee.Feature(ee.Geometry.Point([plot['x'], plot['y']]), {'class': plot['class']})
        }
        const referenceDataCollection = ee.FeatureCollection(referenceData.map(toFeature))
        const prepared$ = defer(() => zip(
            ...imageRecipes.map(recipe => toImage$(recipe, auxiliaryImagery))
        )).pipe(
            map(images => prepared(ee.Image(images)))
        )

        // The statistics are this recipe's, set on the collection it trains on: a reused recipe's, set on its own, do
        // not survive flattening.
        const trainingDataOver = ({image: imageToClassify, statistics}) =>
            concat(
                recipeTrainingData$(),
                of(referenceDataCollection).pipe(
                    map(referenceDataCollection =>
                        imageToClassify.sampleRegions({
                            collection: referenceDataCollection.filterBounds(imageToClassify.geometry()),
                            properties: ['class'],
                            scale: scale || 1,
                            tileScale: classifierConfig.tileScale || 1
                        }))
                )
            ).pipe(
                toArray(),
                map(trainingDataSets => {
                    const trainingData = ee.FeatureCollection(trainingDataSets)
                        .flatten()
                        .set('band_order', imageToClassify.bandNames())
                    return statistics ? trainingData.set(FEATURE_STATISTICS, statistics) : trainingData
                })
            )

        const getTrainingData$ = () => prepared$.pipe(switchMap(trainingDataOver))

        const classify = (trainingData, imageToClassify) => {
            const classifier = classifierConfig.type === 'DECISION_TREE'
                ? createDecisionTreeClassifier(classifierConfig.decisionTree)
                : createClassifier(classifierConfig)
                    .train(trainingData, 'class')
                    .setOutputMode('CLASSIFICATION')
            return imageToClassify
                .classify(classifier)
                .uint8()
                .rename(['class'])
        }

        const createRegression = (trainingData, imageToClassify) => {
            const classifier = createClassifier(classifierConfig)
                .train(trainingData, 'class')
                .setOutputMode('REGRESSION')
            return imageToClassify
                .classify(classifier)
                .float()
                .rename(['regression'])
        }

        const calculateClassProbability = (trainingData, imageToClassify, classification) => {
            const probabilities = calculateProbabilities(trainingData, imageToClassify)
            const multipliers = ee.Image(entries.map(({value}) =>
                ee.Image(1)
                    .where(classification.neq(value), 0)
                    .rename(`probability_${value}`)
            ))
            // A reduction across bands has no footprint: the classified image's is restored, so the band asked for
            // alone stays bounded.
            return probabilities
                .multiply(multipliers)
                .reduce(ee.Reducer.max())
                .clip(imageToClassify.geometry())
                .rename('class_probability')
        }

        const calculateProbabilities = (trainingData, imageToClassify) => {
            const classifier = createClassifier(classifierConfig)
                .train(trainingData, 'class')
                .setOutputMode('MULTIPROBABILITY')
            const probabilityArrayImage = imageToClassify
                .classify(classifier)
                .multiply(100)
                .uint8()
            const classes = ee.List(classifier.explain().get('classes'))
            const indexes = ee.List.sequence(0, classes.size().subtract(1))
            const bandNames = entries.map(({value}) => `probability_${value}`)
            return ee
                .Image(
                    classes.zip(indexes).iterate((valueIndex, acc) => {
                        const value = ee.List(valueIndex).getNumber(0).int()
                        const index = ee.List(valueIndex).getNumber(1).int()
                        return ee.Image(acc).addBands(
                            probabilityArrayImage.arrayGet(index)
                                .rename(ee.String('probability_').cat(value.format())),
                            null, true
                        )
                    }, ee.Image([]))
                )
                .addBands(ee.Image(
                    bandNames.map(bandName => ee.Image(0).clip(imageToClassify.geometry()).rename(bandName))
                ))
                .select(bandNames)
        }

        const classifyImage = (imageToClassify, selectedBands, trainingData) => {
            const bands = []
            if (selectedBands.includes('class') || selectedBands.includes('class_probability')) {
                const classification = classify(trainingData, imageToClassify)
                if (selectedBands.includes('class')) {
                    bands.push(classification)
                }
                if (selectedBands.includes('class_probability')) {
                    const classProbability = calculateClassProbability(trainingData, imageToClassify, classification)
                    bands.push(classProbability)
                }
            }
            if (selectedBands.includes('regression')) {
                const regression = createRegression(trainingData, imageToClassify)
                bands.push(regression)
            }
            const probabilityBands = selectedBands
                .filter(bandName => bandName.startsWith('probability_'))
            if (probabilityBands.length) {
                const probabilities = calculateProbabilities(trainingData, imageToClassify)
                    .select(probabilityBands)
                bands.push(probabilities)
            }
            const image = ee.Image(bands.flat())
            return image
                .updateMask(image.mask().reduce(ee.Reducer.max()))
        }

        selectedBands = selectedBands.length ? selectedBands : getBands()

        return {
            getTrainingData$,
            getImage$() {
                return prepared$.pipe(
                    switchMap(training => trainingDataOver(training).pipe(
                        map(trainingData => project(classifyImage(training.image, selectedBands, trainingData)))
                    ))
                )
            },
            getBands$() {
                return of(getBands())
            },
            getVisParams$() {
                const min = sortedLegend[0].value
                const max = _.last(sortedLegend).value
                const legendPalette = sortedLegend.map(({color}) => color)
                const probabilityPalette = '#000000,#480000,#710101,#BA0000,#FF0000,#FFA500,#FFFF00,#79C900,#006400'
                if (selectedBands.includes('class')) {
                    return of({bands: 'class', min, max, palette: legendPalette})
                } else if (selectedBands.includes('regression')) {
                    return of({bands: 'regression', min, max, palette: legendPalette})
                } else if (selectedBands.includes('class_probability')) {
                    return of({bands: 'class_probability', min: 0, max: 100, palette: probabilityPalette})
                } else {
                    const probabilityBands = selectedBands
                        .filter(bandName => bandName.startsWith('probability_'))
                    if (probabilityBands.length) {
                        return of({bands: probabilityBands[0], min: 0, max: 100, palette: probabilityPalette})
                    } else {
                        throw new Error(`Expected selected bands to contain class, regression, class_probability, or probability_*: ${JSON.stringify(selectedBands)}`)
                    }
                }
            },
            getGeometry$() {
                return imageFactory(imageRecipes[0]).getGeometry$()
            },
            classifyImage(image, bands, trainingData) {
                if (imageRecipes.length > 1) {
                    throw new Error('This recipe contains more than one inputImage. Cannot classify it')
                }
                // Only the features trained on are scaled: other bands of the image are no feature of the classifier.
                const features = addCovariates(image, imageRecipes[0].bandSetSpecs, auxiliaryImagery)
                const scaled = normalizes ? normalized(features, ee.Dictionary(trainingData.get(FEATURE_STATISTICS))) : features
                return classifyImage(image.addBands(scaled, null, true), bands, trainingData)
            }
        }
    }

// Each band scaled to the range `statistics` give it - {band}_min and {band}_max - or, where that range is one value,
// divided by it; a band constant at zero is zero, as Earth Engine divides by zero. Values beyond the range stay beyond
// it.
const normalized = (features, statistics) => ee.Image(
    features.bandNames().iterate((bandName, acc) => {
        bandName = ee.String(bandName)
        const min = statistics.getNumber(bandName.cat('_min'))
        const max = statistics.getNumber(bandName.cat('_max'))
        const band = features.select(bandName)
        const scaled = ee.Image(ee.Algorithms.If(
            min.eq(max),
            band.divide(max),
            unitScale(band, min, max)
        ))
        return ee.Image(acc).addBands(scaled, null, true)
    }, ee.Image([]))
)

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
                ? auxiliaryImage(auxiliaryImagery)
                : ee.Image([]),
            null, true
        )
        .updateMask(
            image.mask().reduce(ee.Reducer.max())
        )

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

const createDecisionTreeClassifier = decisionTree => {
    try {
        decisionTree = JSON.parse(decisionTree)
        // eslint-disable-next-line no-empty
    } catch (_error) {
    } // Probably a single decision tree string
    if (_.isArray(decisionTree)) {
        return ee.Classifier.decisionTreeEnsemble(decisionTree)
    } else if (_.isString(decisionTree)) {
        return ee.Classifier.decisionTree(decisionTree)
    } else {
        throw new Error('Decision tree must either be a JSON array with decision trees or a single decision tree string')
    }
}

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

    const naiveBayes = ({lambda}) =>
        ee.Classifier.smileNaiveBayes({lambda: toFloat(lambda)})

    const svm = ({decisionProcedure, svmType, kernelType, shrinking, degree, gamma, coef0, cost, nu, oneClass}) =>
        ee.Classifier.libsvm({
            decisionProcedure,
            svmType,
            kernelType,
            shrinking,
            degree: kernelType === 'POLY' ? toInt(degree) : null,
            gamma: ['POLY', 'RBF', 'SIGMOID'].includes(kernelType) ? toFloat(gamma) : null,
            coef0: ['POLY', 'SIGMOID'].includes(kernelType) ? toFloat(coef0) : null,
            cost: svmType === 'C_SVC' ? toFloat(cost) : null,
            nu: svmType === 'NU_SVC' ? toFloat(nu) : null,
            oneClass: svmType === 'ONE_CLASS' ? toInt(oneClass) : null
        })

    const minimumDistance = ({metric}) =>
        ee.Classifier.minimumDistance({metric})

    switch (type) {
        case 'RANDOM_FOREST':
            return randomForest(config)
        case 'GRADIENT_TREE_BOOST':
            return gradientTreeBoost(config)
        case 'CART':
            return cart(config)
        case 'NAIVE_BAYES':
            return naiveBayes(config)
        case 'SVM':
            return svm(config)
        case 'MINIMUM_DISTANCE':
            return minimumDistance(config)
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

export default classify
