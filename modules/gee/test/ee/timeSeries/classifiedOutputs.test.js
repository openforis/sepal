import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// What a time-series collection asks of the Classification its Sources select: each image is classified only for the
// regression or class probabilities the request names, and only for those the Classification declares it provides
// (#sepal/recipe/type/classification). The collection, the Classification's execution and its declaration are the
// real ones; Earth Engine is a stand-in whose classifiers record the output mode each is asked for - and refuse, as
// Earth Engine does, a regression of an SVM classifying C_SVC.

const state = {}

// Every Earth Engine expression is the same inert stand-in, whatever is asked of it - except what would make RxJS take
// it for a promise or a scheduler.
const NOT_AN_EXPRESSION = ['then', 'schedule']
const expression = new Proxy(function () {}, {
    get: (_target, property) => NOT_AN_EXPRESSION.includes(property) || typeof property === 'symbol' ? undefined : expression,
    apply: () => expression
})

const classifier = (type, config) => {
    const trained = {
        train: () => trained,
        setOutputMode: mode => {
            if (type === 'libsvm' && config.svmType === 'C_SVC' && mode === 'REGRESSION') {
                throw new Error('Image.classify: The C_SVC SVM type does not support REGRESSION.')
            }
            state.outputModes.push(mode)
            return trained
        },
        explain: () => expression
    }
    return trained
}

mock.module('#sepal/ee/ee', {
    exports: {
        default: new Proxy({
            Classifier: new Proxy({}, {get: (_target, type) => config => classifier(type, config)})
        }, {get: (target, property) => property in target ? target[property] : expression})
    }
})
// Each source collection holds one image, processed as the collection processes it.
const collectionOfOne = () => ({
    map: process => {
        state.processed.push(process(expression))
        return expression
    }
})
mock.module('#sepal/ee/optical/collection', {exports: {allScenes: collectionOfOne}})
mock.module('#sepal/ee/radar/collection', {exports: {createCollection: collectionOfOne}})
mock.module('#sepal/ee/planet/collection', {exports: {createCollection: collectionOfOne}})
mock.module('#sepal/ee/optical/addTasseledCap', {exports: {default: image => image}})
mock.module('#sepal/ee/optical/indexes', {exports: {calculateIndex: () => expression, supportedIndexes: () => []}})
mock.module('#sepal/ee/validate', {exports: {validateEEImageCollection: ({imageCollection}) => imageCollection}})
mock.module('#sepal/ee/imageFactory', {exports: {default: () => ({getImage$: () => of(expression)})}})

const {default: classificationOf} = await import('#sepal/ee/classification/classification')

mock.module('#sepal/ee/recipeRef', {
    exports: {
        default: ({id}) => ({
            getRecipe$: () => {
                state.recipeReads.push(id)
                return of(classificationOf({model: state.classification}))
            }
        })
    }
})

const {getCollection$} = await import('#sepal/ee/timeSeries/collection')

beforeEach(() => {
    Object.assign(state, {outputModes: [], processed: [], recipeReads: [], classification: classification(RANDOM_FOREST)})
})

for (const [collectionType, dataSets, nativeBand] of [
    ['optical', {LANDSAT: ['LANDSAT_8']}, 'ndvi'],
    ['radar', {SENTINEL_1: ['SENTINEL_1']}, 'VV'],
    ['Planet', {PLANET: ['BASEMAPS']}, 'red']
]) {
    describe(`a ${collectionType} collection classified by its Sources' Classification`, () => {
        it('asks an SVM classifying C_SVC for the class probabilities requested, and for no regression', async () => {
            state.classification = classification(SVM_C_SVC)

            await collect({dataSets, bands: ['probability_1', 'probability_2']})

            assert.deepEqual(state.outputModes, ['MULTIPROBABILITY'])
        })

        it('asks a classifier able to regress for no regression where only class probabilities are requested', async () => {
            await collect({dataSets, bands: ['probability_2']})

            assert.deepEqual(state.outputModes, ['MULTIPROBABILITY'])
        })

        it('asks a classifier able to regress for its regression where it is requested', async () => {
            await collect({dataSets, bands: ['regression']})

            assert.deepEqual(state.outputModes, ['REGRESSION'])
        })

        it('refuses a regression the Classification does not provide, before classifying or processing anything', async () => {
            state.classification = classification(SVM_C_SVC)

            await assert.rejects(collect({dataSets, bands: ['regression']}), error =>
                error.errorCode === 'UNSUPPORTED_CLASSIFIED_OUTPUT' && /does not provide regression/.test(error.message))
            assert.deepEqual(state.outputModes, [])
            assert.deepEqual(state.processed, [])
        })

        it('reads nothing of the Classification for a band of the images themselves', async () => {
            await collect({dataSets, bands: [nativeBand]})

            assert.deepEqual(state.recipeReads, [])
            assert.deepEqual(state.outputModes, [])
            assert.equal(state.processed.length, 1)
        })

        // A Time Series' count asks for the images' first band by position.
        it('reads nothing of the Classification for a band asked for by position', async () => {
            await collect({dataSets, bands: [0]})

            assert.deepEqual(state.recipeReads, [])
            assert.equal(state.processed.length, 1)
        })
    })
}

const CLASSIFICATION = 'classification-1'
const RANDOM_FOREST = {type: 'RANDOM_FOREST', numberOfTrees: 25}
const SVM_C_SVC = {type: 'SVM', svmType: 'C_SVC', kernelType: 'RBF', gamma: 0.5, cost: 10}

// Over one asset, of two classes, trained on points collected for it.
const classification = classifier => ({
    inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
    legend: {entries: [{value: 1}, {value: 2}]},
    trainingData: {dataSets: [{type: 'COLLECTED', referenceData: [{x: 0, y: 0, class: 1}, {x: 1, y: 1, class: 2}]}]},
    classifier: {...classifier, normalize: 'NO'}
})

const collect = ({dataSets, bands}) => firstValueFrom(getCollection$({
    recipe: {model: {
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSets, classification: CLASSIFICATION},
        options: {corrections: ['SR']}
    }},
    geometry: expression,
    bands
}))
