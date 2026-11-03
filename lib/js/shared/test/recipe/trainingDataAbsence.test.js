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
// and keeps its own diagnosis. A Classification's points, all its data sets' and its reuse's together, must also hold
// what its classifier's training needs of them - for its image and as a classifier, never for the training data it
// supplies another - known the same way. Codes, roles, paths and types are literals.

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

// What a trained classifier needs of the points it trains on, as Earth Engine trains it (trainingNeeds,
// classification.js): two classes at least for the tree and Bayes classifiers, points of the class a one-class SVM trains
// on, two points of a class for Mahalanobis minimum distance, and nothing more for the rest - never a point of each
// legend class. Each is a need sampling cannot meet where the points stored do not: masking only takes points away.
describe('a CLASSIFICATION trained on points', () => {
    for (const type of ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART', 'NAIVE_BAYES']) {
        for (const operation of ['IMAGE_OUTPUT', 'CLASSIFIER']) {
            it(`by ${type} cannot run for ${operation} on points of one class, naming it`, () => {
                const readiness = read(classifiedBy(type, pointsOf(1, 1, 1)), [], operation)

                assert.deepEqual(sampleFindingsOf(readiness), [shortfall({need: 'MINIMUM_CLASSES', classes: [1], minimum: 2})])
            })
        }

        it(`by ${type} can run on a point of each of two classes, though a third legend class has none`, () => {
            assert.equal(read(classifiedBy(type, pointsOf(1, 2), {legend: [1, 2, 3]}), []).status, 'READY')
        })
    }

    for (const [name, classifier] of [
        ['a C-SVC', {type: 'SVM', svmType: 'C_SVC'}],
        ['a NU-SVC', {type: 'SVM', svmType: 'NU_SVC'}],
        ['an SVM of Earth Engine\'s default type', {type: 'SVM'}],
        ['Euclidean minimum distance', {type: 'MINIMUM_DISTANCE', metric: 'euclidean'}],
        ['cosine minimum distance', {type: 'MINIMUM_DISTANCE', metric: 'cosine'}],
        ['minimum distance of Earth Engine\'s default metric', {type: 'MINIMUM_DISTANCE'}]
    ]) {
        it(`by ${name} can run on one point of one class`, () => {
            assert.equal(read(classifiedBy(classifier, pointsOf(1)), []).status, 'READY')
        })
    }

    // Whether its nu is feasible depends on how the points sampled divide between classes, which masking can change.
    it('by a NU-SVC can run however its points divide between classes', () => {
        assert.equal(read(classifiedBy({type: 'SVM', svmType: 'NU_SVC', nu: 0.5}, pointsOf(1, 2, 2, 2, 2, 2)), []).status, 'READY')
    })

    for (const [_case, oneClass, values, missing] of [
        ['can run on points of the class it is configured with, whatever other classes have', 1, [1, 2, 2], null],
        ['cannot run without a point of the class it is configured with, naming it', 2, [1, 1], 2],
        ['cannot run without a point of class 0, which it is configured with', 0, [1], 0],
        ['trains on class 0 where it is configured with none, and can run on points of it', undefined, [0], null],
        ['trains on class 0 where it is configured with none, and cannot run without a point of it', undefined, [1, 2], 0]
    ]) {
        it(`by a one-class SVM ${_case}`, () => {
            const readiness = read(classifiedBy({type: 'SVM', svmType: 'ONE_CLASS', oneClass}, pointsOf(...values), {legend: [1, 2]}), [])

            assert.deepEqual(sampleFindingsOf(readiness), missing === null ? [] : [shortfall({need: 'TRAINED_CLASS', classes: [missing]})])
        })
    }

    it('by Mahalanobis minimum distance cannot run while no class has two points, naming its classes', () => {
        const readiness = read(classifiedBy(MAHALANOBIS, pointsOf(1, 2)), [])

        assert.deepEqual(sampleFindingsOf(readiness), [shortfall({need: 'MINIMUM_CLASS_SAMPLES', classes: [1, 2], minimum: 2})])
    })

    // A class of one point is refused where it is sampled, but masking can take it away, leaving the rest to train on. How
    // well a covariance can be inverted depends on the values sampled, not on how many points there are.
    for (const [_case, points] of [
        ['a class of one point beside a class of more, which masking can take away', () => pointsOf(1, 2, 2, 2)],
        ['two points of each class', () => pointsOf(1, 1, 2, 2)],
        ['points of one class alone', () => pointsOf(1, 1, 1)],
        ['two points of each class at the same place', () => [1, 1, 2, 2].map(value => ({x: 0, y: 0, class: value}))]
    ]) {
        it(`by Mahalanobis minimum distance can run on ${_case}`, () => {
            assert.equal(read(classifiedBy(MAHALANOBIS, points()), []).status, 'READY')
        })
    }

    it('counts the points of every data set together, a class of one point in each having two', () => {
        const consumer = classifiedBy(MAHALANOBIS, pointsOf(1, 2))
        consumer.model.trainingData.dataSets.push({dataSetId: 'uploaded', type: 'CSV_UPLOAD', referenceData: pointsOf(1)})

        assert.equal(read(consumer, []).status, 'READY')
    })

    it('counts the points of the recipes it reuses with its own, however far their reuse goes', () => {
        const consumer = classifiedBy(MAHALANOBIS, pointsOf(1), {reuses: ['p']})
        const chain = (...values) => [recipeOf('CLASSIFICATION', 'p', {reuses: ['q']}), recipeOf('CLASSIFICATION', 'q', {points: pointsOf(...values)})]

        assert.equal(read(consumer, chain(1, 2)).status, 'READY')
        assert.deepEqual(sampleFindingsOf(read(consumer, chain(2))), [shortfall({need: 'MINIMUM_CLASS_SAMPLES', classes: [1, 2], minimum: 2})])
    })

    // Execution samples a recipe once for each data set its reuse is reached through.
    it('counts the points of a recipe two of the recipes it reuses share along each', () => {
        const consumer = classifiedBy(MAHALANOBIS, [], {reuses: ['a', 'b']})
        const shared = [recipeOf('CLASSIFICATION', 'a', {reuses: ['d']}), recipeOf('CLASSIFICATION', 'b', {reuses: ['d']}), recipeOf('CLASSIFICATION', 'd', {points: pointsOf(1, 2)})]

        assert.equal(read(consumer, shared).status, 'READY')
    })

    it('takes the classes of the recipes it reuses with its own, however far their reuse goes', () => {
        const consumer = classifiedBy('RANDOM_FOREST', pointsOf(1), {reuses: ['p']})
        const chain = (...values) => [recipeOf('CLASSIFICATION', 'p', {reuses: ['q']}), recipeOf('CLASSIFICATION', 'q', {points: pointsOf(...values)})]

        assert.equal(read(consumer, chain(2)).status, 'READY')
        assert.deepEqual(sampleFindingsOf(read(consumer, chain(1))), [shortfall({need: 'MINIMUM_CLASSES', classes: [1], minimum: 2})])
    })

    it('says it has no training data, and nothing of what its points lack, while it stores no point at all', () => {
        assert.deepEqual(findingsOf(read(classifiedBy('RANDOM_FOREST', []), [])), [NO_TRAINING_DATA_AT_CONSUMER])
    })

    it('waits, establishing nothing of what its points lack, while a recipe it reuses is not held', () => {
        const readiness = read(classifiedBy('RANDOM_FOREST', pointsOf(1), {reuses: ['p']}), [])

        assert.equal(readiness.status, 'NEEDS_EVIDENCE')
        assert.deepEqual(readiness.findings, [])
    })

    it('establishes nothing of what its points lack through a recipe of a type that produces no training data', () => {
        const mosaic = {id: 'mosaic-1', type: 'MOSAIC', model: {}}

        const readiness = read(classifiedBy('RANDOM_FOREST', pointsOf(1), {reuses: [mosaic.id]}), [mosaic])

        assert.deepEqual(readiness.findings.map(({code}) => code), ['UNDECLARED_OPERATION'])
    })

    it('leaves a recipe whose points are of one class able to produce its training data, for one storing another to run on', () => {
        const provider = classifiedBy('RANDOM_FOREST', pointsOf(1), {id: 'p'})

        assert.equal(read(provider, [], 'TRAINING_DATA').status, 'READY')
        assert.equal(read(classifiedBy('RANDOM_FOREST', pointsOf(2), {reuses: ['p']}), [provider]).status, 'READY')
    })

    it('can run by a supplied decision tree on points of one class, as it is not trained', () => {
        assert.equal(read(classifiedBy('DECISION_TREE', pointsOf(1)), []).status, 'READY')
    })
})

describe('a REGRESSION', () => {
    it('can run on points of one class, trained on their values', () => {
        assert.equal(read(recipeOf('REGRESSION', CONSUMER, {points: pointsOf(1, 1, 1)}), []).status, 'READY')
    })
})

const CONSUMER = 'consumer-1'
const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]
const NO_TRAINING_DATA_AT_CONSUMER = {code: 'NO_TRAINING_DATA', path: ['model', 'trainingData', 'dataSets'], recipePath: [CONSUMER]}

const MAHALANOBIS = {type: 'MINIMUM_DISTANCE', metric: 'mahalanobis'}

// A point of each of these classes, in turn.
const pointsOf = (...values) => values.map((value, i) => ({x: i, y: i, class: value, value}))

// A Classification by this classifier, storing these points.
const classifiedBy = (classifier, points, {id = CONSUMER, ...options} = {}) => recipeOf('CLASSIFICATION', id, {points, classifier, ...options})

const shortfall = details =>
    ({code: 'INSUFFICIENT_TRAINING_SAMPLES', path: ['model', 'trainingData', 'dataSets'], recipePath: [CONSUMER], ...details})

const observed = {bands: [{name: 'red', dataType: {arrayDimensions: 0}}], evidence: []}

// A recipe of `type` over an asset of its own, trained on the points it stores and the recipes it reuses, to tell the
// classes of its legend apart; a classifier is its type, or its configuration.
const recipeOf = (type, id, {points = [], reuses = [], classifier = 'RANDOM_FOREST', legend = [1, 2]} = {}) => ({
    id,
    type,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: `users/x/${id}`, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red']}]}]},
        legend: {entries: legend.map(value => ({value}))},
        classifier: typeof classifier === 'string' ? {type: classifier} : classifier,
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

const sampleFindingsOf = readiness => readiness.findings.map(({code, path, recipePath, need, classes, minimum}) =>
    ({code, path, recipePath, need, classes, ...minimum !== undefined && {minimum}}))
