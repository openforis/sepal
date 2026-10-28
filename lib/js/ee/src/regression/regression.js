import _ from 'lodash'
import {concat, defer, EMPTY, map, of, switchMap, toArray, zip} from 'rxjs'

import {addCovariates, definedFeatures, featureDefinition, samplingProjection} from '#sepal/ee/classification/features'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import recipeRef from '#sepal/ee/recipeRef'
import {REGRESSION_BANDS} from '#sepal/recipe/type/regression'

const BAND_NAMES = REGRESSION_BANDS.map(({name}) => name)

const classify =
    recipe => {
        const {
            inputImagery: {images: imageRecipes},
            trainingData: {dataSets},
            auxiliaryImagery = [],
            classifier: classifierConfig,
            scale
        } = recipe.model
        // The samples of the recipes this one reuses (getSamples$), in configured order: each sampled over its own imagery
        // at its own points and scale with the features `definition` defines.
        const reusedSamples$ = definition => zip(...dataSets
            .filter(({type}) => type === 'RECIPE')
            .map(({recipe}) =>
                recipeRef({id: recipe}).getRecipe$().pipe(
                    switchMap(recipe => recipe.getSamples$(definition))
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
        // Each input image, its band sets and the features it gives this recipe.
        const inputs$ = defer(() => zip(
            ...imageRecipes.map(recipe => imageFactory(recipe).getImage$().pipe(
                map(image => ({image, bandSetSpecs: recipe.bandSetSpecs, features: addCovariates(image, recipe.bandSetSpecs, auxiliaryImagery)}))
            ))
        ))
        const imageToClassify$ = inputs$.pipe(
            map(inputs => ee.Image(inputs.map(({features}) => features)))
        )

        // This recipe's own points sampled over `image`, on the grid `projection` gives, where one is given.
        const ownSamples = (image, projection) => image.sampleRegions({
            collection: referenceDataCollection.filterBounds(image.geometry()),
            properties: ['value'],
            scale: scale || 1,
            ...(projection && {projection}),
            tileScale: classifierConfig.tileScale || 1
        })

        // What a recipe reusing this one's training data trains on: the features its `definition` defines, sampled of
        // this recipe's own input images at its own points, after those of the recipes this one reuses in turn. Storing
        // no point, it builds and samples nothing of its own.
        const getSamples$ = definition => concat(
            reusedSamples$(definition),
            referenceData.length
                ? defer(() => zip(...imageRecipes.map(recipe => imageFactory(recipe).getImage$()))).pipe(
                    map(images => {
                        const features = definedFeatures(images, definition, recipe.title || recipe.id)
                        return ownSamples(features, samplingProjection(features, images, definition))
                    })
                )
                : EMPTY
        ).pipe(
            toArray(),
            map(trainingDataSets => ee.FeatureCollection(trainingDataSets).flatten())
        )

        const getTrainingData$ = bands => {
            return inputs$.pipe(
                switchMap(inputs => {
                    const imageToClassify = ee.Image(inputs.map(({features}) => features))
                    return concat(
                        reusedSamples$(featureDefinition(inputs, auxiliaryImagery)),
                        of(referenceDataCollection).pipe(
                            map(() => ownSamples(imageToClassify))
                        )
                    ).pipe(
                        toArray(),
                        map(trainingDataSets =>
                            ee.FeatureCollection(trainingDataSets)
                                .flatten()
                                .set('band_order', bands || imageToClassify.bandNames())
                        )
                    )
                })
            )
        }

        const createRegression = ({trainingData, imageToClassify}) => {
            const classifier = createClassifier(classifierConfig)
                .train(trainingData, 'value')
                .setOutputMode('REGRESSION')
            return imageToClassify
                .classify(classifier)
                .float()
                .rename(BAND_NAMES)
        }

        return {
            getTrainingData$,
            getSamples$,
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
                return of(BAND_NAMES)
            },
            getGeometry$() {
                return imageFactory(imageRecipes[0]).getGeometry$()
            }
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

export default classify
