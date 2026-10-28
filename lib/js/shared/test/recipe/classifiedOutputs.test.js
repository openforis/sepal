import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {classificationBands} from '#sepal/recipe/type/classification'

// What a Classification outputs, by its classifier's configuration - Earth Engine's table of output modes - and what a
// recipe whose Sources choose one of those outputs needs of it: CCDC's breakpoint bands, Phenology's band. Judged from
// the Classification's record alone. Codes, operations, bands and classifier names are literals.

describe('the outputs a Classification declares', () => {
    for (const [classifier, outputs] of [
        [{type: 'RANDOM_FOREST'}, ['class', 'class_probability', 'regression', 'probability_1', 'probability_2']],
        [{type: 'GRADIENT_TREE_BOOST'}, ['class', 'class_probability', 'regression', 'probability_1', 'probability_2']],
        [{type: 'CART'}, ['class', 'class_probability', 'regression', 'probability_1', 'probability_2']],
        [{type: 'NAIVE_BAYES'}, ['class', 'class_probability', 'probability_1', 'probability_2']],
        [{type: 'SVM', svmType: 'C_SVC'}, ['class', 'class_probability', 'probability_1', 'probability_2']],
        [{type: 'SVM', svmType: 'NU_SVC'}, ['class', 'class_probability', 'probability_1', 'probability_2']],
        [{type: 'SVM', svmType: 'ONE_CLASS'}, ['class']],
        [{type: 'SVM'}, ['class', 'class_probability', 'probability_1', 'probability_2']],
        [{type: 'MINIMUM_DISTANCE'}, ['class']],
        [{type: 'DECISION_TREE'}, ['class']]
    ]) {
        it(`are ${outputs.join(', ')} for ${JSON.stringify(classifier)}`, () => {
            assert.deepEqual(classificationBands(classificationOf(classifier).model).map(({name}) => name), outputs)
        })
    }
})

for (const [type, field, valueOf] of [
    ['CCDC', 'breakpointBands', bands => bands],
    ['PHENOLOGY', 'band', ([band]) => band]
]) {
    describe(`a ${type} choosing classified outputs at its ${field}`, () => {
        for (const [operation] of type === 'CCDC' ? [['IMAGE_OUTPUT'], ['PIXEL_SEGMENTS']] : [['IMAGE_OUTPUT']]) {
            it(`cannot run ${operation} where its classification's classifier does not provide one, refused at that field`, () => {
                const recipe = recipeOf(type, {[field]: valueOf(['regression'])})

                const {readiness} = read(recipe, [classificationOf({type: 'SVM', svmType: 'C_SVC'})], operation)

                assert.equal(readiness.status, 'NOT_READY')
                assert.deepEqual(readiness.findings.map(({code, path, unsupported, recipePath}) => ({code, path, unsupported, recipePath})), [
                    {code: 'UNSUPPORTED_CLASSIFIED_OUTPUT', path: ['model', 'sources', field], unsupported: ['regression'], recipePath: [recipe.id]}
                ])
            })
        }

        it('cannot run a class probability an SVM of one class does not provide, though another SVM type does', () => {
            const recipe = recipeOf(type, {[field]: valueOf(['probability_1'])})

            assert.equal(read(recipe, [classificationOf({type: 'SVM', svmType: 'ONE_CLASS'})]).readiness.status, 'NOT_READY')
            assert.equal(read(recipe, [classificationOf({type: 'SVM', svmType: 'NU_SVC'})]).readiness.status, 'READY')
        })

        it('can run the outputs a classifier able to regress provides', () => {
            const recipe = recipeOf(type, {[field]: valueOf(['regression'])})

            assert.equal(read(recipe, [classificationOf({type: 'RANDOM_FOREST'})]).readiness.status, 'READY')
        })

        it('can run a band of the images themselves, whatever the classifier outputs', () => {
            const recipe = recipeOf(type, {[field]: valueOf(['ndvi'])})

            assert.equal(read(recipe, [classificationOf({type: 'SVM', svmType: 'ONE_CLASS'})]).readiness.status, 'READY')
        })

        // Waiting for it is the closure's: a graph missing the record is incomplete (recipeOutput.js, executionReadiness.js).
        it('finds nothing while its classification is not held', () => {
            const recipe = recipeOf(type, {[field]: valueOf(['regression'])})

            assert.deepEqual(read(recipe, []).readiness.findings, [])
        })

        it('cannot run a classified output with no classification selected', () => {
            const recipe = recipeOf(type, {[field]: valueOf(['probability_1']), classification: undefined})

            assert.deepEqual(read(recipe, []).readiness.findings.map(({code, unsupported}) => [code, unsupported]), [
                ['UNSUPPORTED_CLASSIFIED_OUTPUT', ['probability_1']]
            ])
        })
    })
}

const CLASSIFICATION = 'classification-1'

const INPUT = 'users/x/input'

// Of two classes, over optical bands the Landsat scenes supply, trainable: it stores points, and its input is observed
// holding the bands it selects (`read`).
const classificationOf = classifier => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: INPUT, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend: {entries: [{value: 1}, {value: 2}]},
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]},
        classifier
    }
})

const recipeOf = (type, sources) => ({
    id: 'recipe-1',
    type,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01', fromYear: 2020, toYear: 2020},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], band: 'ndvi', classification: CLASSIFICATION, ...sources},
        options: {corrections: ['SR']}
    }
})

const read = (root, records, operation = 'IMAGE_OUTPUT') => readReadiness({
    graph: buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))}),
    operation,
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type),
    observationFor: ({type, id}) => type === 'ASSET' && id === INPUT
        ? {bands: ['red', 'nir'].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
        : undefined
})
