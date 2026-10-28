import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {dependencyValidity} from '#sepal/recipe/source/dependencyValidity'
import {noTrainingData} from '#sepal/recipe/trainingData'

// Whether a Classification or Regression is known from configuration to have nothing to train on: no data set stores a
// point, and every recipe it reuses training data from is held and, however far its own reuse goes, stores none either
// (trainingData.js). Said at the consumer's training data, for its image; a recipe that stores none is no reason to
// refuse it as a provider. What is not held, resolves to nothing or cannot produce training data establishes nothing,
// and keeps its own diagnosis. Codes, roles, paths and types are literals.

for (const type of ['CLASSIFICATION', 'REGRESSION']) {
    describe(`a ${type} reusing training data`, () => {
        it('cannot run where the recipe it reuses stores no point, said at its training data', () => {
            const readiness = read(recipeOf(type, CONSUMER, {reuses: ['p']}), [recipeOf(type, 'p')])

            assert.deepEqual(findingsOf(readiness), [NO_TRAINING_DATA_AT_CONSUMER])
        })

        it('cannot run where no recipe of a long chain of reuse stores a point', () => {
            const readiness = read(recipeOf(type, CONSUMER, {reuses: ['p']}), [
                recipeOf(type, 'p', {reuses: ['q']}),
                recipeOf(type, 'q', {reuses: ['r']}),
                recipeOf(type, 'r')
            ])

            assert.deepEqual(findingsOf(readiness), [NO_TRAINING_DATA_AT_CONSUMER])
        })

        it('can run where any recipe of its chains of reuse stores a point, beside one that stores none', () => {
            const readiness = read(recipeOf(type, CONSUMER, {reuses: ['empty', 'p']}), [
                recipeOf(type, 'empty'),
                recipeOf(type, 'p', {reuses: ['q']}),
                recipeOf(type, 'q', {points: POINTS})
            ])

            assert.equal(readiness.status, 'READY')
        })

        it('waits, establishing nothing, while a recipe of its chain of reuse is not held', () => {
            const readiness = read(recipeOf(type, CONSUMER, {reuses: ['p']}), [recipeOf(type, 'p', {reuses: ['q']})])

            assert.equal(readiness.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(readiness.findings, [])
            assert.deepEqual(readiness.needs.records, ['q'])
        })

        it('establishes nothing of a data set that reuses no recipe it names', () => {
            const consumer = recipeOf(type, CONSUMER)
            consumer.model.trainingData.dataSets.push({dataSetId: 'malformed', type: 'RECIPE'})

            const readiness = read(consumer, [])

            assert.deepEqual(readiness.findings.filter(({code}) => code === 'NO_TRAINING_DATA'), [])
        })

        // A Mosaic produces no training data, whatever its model holds.
        it('establishes nothing of a recipe of a type that produces no training data, though its model lists no data sets', () => {
            const mosaic = {id: 'mosaic-1', type: 'MOSAIC', model: {trainingData: {dataSets: []}}}

            const readiness = read(recipeOf(type, CONSUMER, {reuses: [mosaic.id]}), [mosaic])

            assert.deepEqual(readiness.findings.map(({code, recipePath}) => ({code, recipePath})), [
                {code: 'UNDECLARED_OPERATION', recipePath: [CONSUMER, mosaic.id]}
            ])
        })

        it('is refused once where two recipes it reuses share one that stores no point, and can run once it stores one', () => {
            const sharing = d => [recipeOf(type, 'a', {reuses: ['d']}), recipeOf(type, 'b', {reuses: ['d']}), d]
            const consumer = recipeOf(type, CONSUMER, {reuses: ['a', 'b']})

            assert.deepEqual(findingsOf(read(consumer, sharing(recipeOf(type, 'd')))), [NO_TRAINING_DATA_AT_CONSUMER])
            assert.equal(read(consumer, sharing(recipeOf(type, 'd', {points: POINTS}))).status, 'READY')
        })

        it('is refused for reuse that leads back to itself as its dependencies, not for training data', () => {
            const consumer = recipeOf(type, CONSUMER, {reuses: ['a']})
            const records = [recipeOf(type, 'a', {reuses: [CONSUMER]})]

            assert.equal(dependencyValidity({status: 'COMPLETE', graph: graphOf(consumer, records)}).status, 'INVALID')
            assert.deepEqual(read(consumer, records).findings, [])
        })

        it('can run once a point is added upstream, and cannot once it is removed', () => {
            const consumer = recipeOf(type, CONSUMER, {reuses: ['p']})
            const chain = points => [recipeOf(type, 'p', {reuses: ['q']}), recipeOf(type, 'q', {points})]

            assert.equal(read(consumer, chain(POINTS)).status, 'READY')
            assert.deepEqual(findingsOf(read(consumer, chain([]))), [NO_TRAINING_DATA_AT_CONSUMER])
        })

        it('leaves a recipe that stores no point able to produce its training data', () => {
            const readiness = read(recipeOf(type, 'p'), [], 'TRAINING_DATA')

            assert.equal(readiness.status, 'READY')
        })

        it('takes a reused recipe for one storing points where it is judged without the read\'s records', () => {
            assert.equal(noTrainingData(recipeOf(type, CONSUMER, {reuses: ['p']}).model), false)
        })
    })
}

describe('a CLASSIFICATION by a supplied decision tree', () => {
    it('can run reusing recipes that store no point, as it is not trained', () => {
        const readiness = read(recipeOf('CLASSIFICATION', CONSUMER, {reuses: ['p'], classifier: 'DECISION_TREE'}), [recipeOf('CLASSIFICATION', 'p')])

        assert.equal(readiness.status, 'READY')
    })
})

const CONSUMER = 'consumer-1'
const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]
const NO_TRAINING_DATA_AT_CONSUMER = {code: 'NO_TRAINING_DATA', path: ['model', 'trainingData', 'dataSets'], recipePath: [CONSUMER]}

const observed = {bands: [{name: 'red', dataType: {arrayDimensions: 0}}], evidence: []}

// A recipe of `type` over an asset of its own, trained on the points it stores and the recipes it reuses.
const recipeOf = (type, id, {points = [], reuses = [], classifier = 'RANDOM_FOREST'} = {}) => ({
    id,
    type,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: `users/x/${id}`, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red']}]}]},
        legend: {entries: [{value: 1}, {value: 2}]},
        classifier: {type: classifier},
        trainingData: {dataSets: [
            ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
            ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
        ]}
    }
})

const graphOf = (root, records) =>
    buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))})

// Readiness from what is held now, every asset observed holding red.
const read = (root, records, operation = 'IMAGE_OUTPUT') => readReadiness({
    graph: graphOf(root, records),
    operation,
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type),
    observationFor: ({type}) => type === 'ASSET' ? observed : undefined
}).readiness

const findingsOf = readiness => readiness.findings.map(({code, path, recipePath}) => ({code, path, recipePath}))
