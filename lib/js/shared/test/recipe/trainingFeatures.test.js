import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {of, throwError} from 'rxjs'

import {settledReadiness$} from '#sepal/recipe/output/observeImageOutput'
import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Whether the samples a Classification or Regression trains on carry every feature it is trained on (trainingData.js):
// execution trains on its own band names (`band_order`), so each recipe storing points anywhere in a data set's reuse
// must sample all of them over its own input, whatever another samples. Found at the consumer's data set, naming that
// recipe and what it lacks. What is not observed, or observed failing, establishes nothing. Codes, roles, paths and
// types are literals.

for (const type of ['CLASSIFICATION', 'REGRESSION']) {
    describe(`a ${type} reusing training data`, () => {
        it('can run where the recipe it reuses samples every feature it trains on, and more', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {included: ['red', 'nir', 'swir']})])

            assert.equal(readiness.status, 'READY')
        })

        it('cannot run where the recipe it reuses samples fewer, found at the data set reusing it', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {included: ['red']})])

            assert.deepEqual(featureFindingsOf(readiness), [lacking(0, 'p', ['nir'])])
        })

        it('cannot run where a band combination is named for another band order than its own', () => {
            const consumer = consumerOf(type, {reuses: ['p'], bandSets: [bands('PAIR_WISE_EXPRESSION', ['red', 'nir'], 'RATIO')]})
            const provider = providerOf(type, 'p', {asset: NIR_FIRST_ASSET, bandSets: [bands('PAIR_WISE_EXPRESSION', ['red', 'nir'], 'RATIO')]})

            const readiness = read(consumer, [provider])

            assert.deepEqual(featureFindingsOf(readiness), [lacking(0, 'p', ['red_nir_ratio'])])
        })

        it('cannot run where it is given an auxiliary covariate the recipe it reuses is not', () => {
            const readiness = read(consumerOf(type, {reuses: ['p'], auxiliaryImagery: ['LATITUDE']}), [providerOf(type, 'p')])

            assert.deepEqual(featureFindingsOf(readiness), [lacking(0, 'p', ['latitude'])])
        })

        it('cannot run where any recipe storing points lacks a feature, whatever the others sample between them', () => {
            const readiness = read(consumerOf(type, {reuses: ['a', 'b']}), [
                providerOf(type, 'a', {included: ['red']}),
                providerOf(type, 'b', {included: ['nir']})
            ])

            assert.deepEqual(featureFindingsOf(readiness), [lacking(0, 'a', ['nir']), lacking(1, 'b', ['red'])])
        })

        it('cannot run where a recipe further along the reuse samples fewer, found at the data set it is reached through', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [
                providerOf(type, 'p', {points: [], included: ['red'], reuses: ['q']}),
                providerOf(type, 'q', {included: ['red']})
            ])

            assert.deepEqual(featureFindingsOf(readiness), [lacking(0, 'q', ['nir'])])
        })

        // Execution suffixes the second of two band combinations sharing a name (a_b with c, a with b_c), as it adds bands.
        it('establishes nothing of a recipe whose band combinations share a name', () => {
            const consumer = consumerOf(type, {reuses: ['p'], asset: SUFFIXED_ASSET, bandSets: [bands('IMAGE_BANDS', ['a_b_c_ratio', 'a_b_c_ratio_1'])]})
            const provider = providerOf(type, 'p', {asset: COLLIDING_ASSET, bandSets: [bands('PAIR_WISE_EXPRESSION', ['a_b', 'c', 'a', 'b_c'], 'RATIO')]})

            const readiness = read(consumer, [provider])

            assert.equal(readiness.status, 'READY')
        })

        it('can run reusing a recipe storing no point, whatever it samples', () => {
            const readiness = read(consumerOf(type, {points: POINTS, reuses: ['empty']}), [providerOf(type, 'empty', {points: [], included: ['red']})])

            assert.equal(readiness.status, 'READY')
        })

        it('is found at each data set reusing a recipe that samples fewer', () => {
            const readiness = read(consumerOf(type, {reuses: ['a', 'b']}), [
                providerOf(type, 'a', {points: [], reuses: ['shared']}),
                providerOf(type, 'b', {points: [], reuses: ['shared']}),
                providerOf(type, 'shared', {included: ['red']})
            ])

            assert.deepEqual(featureFindingsOf(readiness), [lacking(0, 'shared', ['nir']), lacking(1, 'shared', ['nir'])])
        })

        it('can run once the recipe it reuses samples the features it lacked', () => {
            const consumer = consumerOf(type, {reuses: ['p']})

            assert.deepEqual(featureFindingsOf(read(consumer, [providerOf(type, 'p', {included: ['red']})])), [lacking(0, 'p', ['nir'])])
            assert.equal(read(consumer, [providerOf(type, 'p', {included: ['red', 'nir']})]).status, 'READY')
        })

        it('waits, finding nothing, for its own input and that of a recipe storing points while they are not observed', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {included: ['red']})], {})

            assert.equal(readiness.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(readiness.findings, [])
            assert.deepEqual(readiness.needs.observations.map(({id}) => id).sort(), [CONSUMER_ASSET, assetOf('p')].sort())
        })

        it('does not wait for its own input where no recipe it reuses stores points', () => {
            const readiness = read(consumerOf(type, {points: POINTS, reuses: ['empty']}), [providerOf(type, 'empty', {points: []})], {})

            assert.deepEqual(readiness.needs.observations.map(({id}) => id), [assetOf('empty')])
        })

        it('is unavailable, finding nothing, where the input of a recipe further along could not be observed', () => {
            const readiness = settled(consumerOf(type, {reuses: ['p']}), [
                providerOf(type, 'p', {points: [], reuses: ['q']}),
                providerOf(type, 'q', {included: ['red']})
            ], {[assetOf('q')]: new Error('Earth Engine unreachable')})

            assert.equal(readiness.status, 'UNAVAILABLE')
            assert.deepEqual(readiness.findings, [])
        })

        it('is refused, finding nothing of its features, where the input of a recipe further along has no image, said there', () => {
            const nested = providerOf(type, 'q')
            nested.model.inputImagery.images = [{imageId: 'i-1', type: 'RECIPE_REF', id: SAMPLING_DESIGN.id, bandSetSpecs: [bands('IMAGE_BANDS', ['red'])]}]

            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {points: [], reuses: ['q']}), nested, SAMPLING_DESIGN])

            assert.deepEqual(readiness.findings.map(({code, recipePath}) => ({code, recipePath})), [
                {code: 'NON_IMAGE_OUTPUT', recipePath: [CONSUMER, 'p', 'q', SAMPLING_DESIGN.id]}
            ])
        })

        it('establishes nothing where it, or the recipe it reuses, is over several input images', () => {
            const consumer = consumerOf(type, {reuses: ['p']})
            const severalInputs = recipe => ({...recipe, model: {...recipe.model, inputImagery: {images: [
                ...recipe.model.inputImagery.images,
                {...recipe.model.inputImagery.images[0], imageId: 'i-2'}
            ]}}})

            assert.equal(read(severalInputs(consumer), [providerOf(type, 'p', {included: ['red']})]).status, 'READY')
            assert.equal(read(consumer, [severalInputs(providerOf(type, 'p', {included: ['red']}))]).status, 'READY')
        })
    })
}

describe('a CLASSIFICATION by a supplied decision tree', () => {
    it('can run reusing a recipe that samples fewer features, as it is not trained', () => {
        const consumer = consumerOf('CLASSIFICATION', {reuses: ['p']})
        consumer.model.classifier = {type: 'DECISION_TREE'}

        const readiness = read(consumer, [providerOf('CLASSIFICATION', 'p', {included: ['red']})])

        assert.equal(readiness.status, 'READY')
    })
})

const CONSUMER = 'consumer-1'
const CONSUMER_ASSET = 'users/x/consumer'
const NIR_FIRST_ASSET = 'users/x/nir-first'
const COLLIDING_ASSET = 'users/x/colliding'
const SUFFIXED_ASSET = 'users/x/suffixed'
const SAMPLING_DESIGN = {id: 'sampling-1', type: 'SAMPLING_DESIGN', model: {}}
const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]

const assetOf = id => `users/x/${id}`

const observed = (...names) => ({bands: names.map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []})

// Every asset holds red, nir and swir, but those named here.
const observationOf = id => observed(...{
    [NIR_FIRST_ASSET]: ['nir', 'red'],
    [COLLIDING_ASSET]: ['a_b', 'c', 'a', 'b_c'],
    [SUFFIXED_ASSET]: ['a_b_c_ratio', 'a_b_c_ratio_1']
}[id] || ['red', 'nir', 'swir'])

const bands = (type, included, operation) => ({id: `${type}-set`, type, included, ...(operation && {operation})})

// A recipe of `type` over one asset, selecting `bandSets` of it, trained on the points it stores and the recipes it reuses.
const recipeOf = (type, id, {asset, bandSets, points, reuses, auxiliaryImagery = []}) => ({
    id,
    type,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: asset, bandSetSpecs: bandSets}]},
        auxiliaryImagery,
        legend: {entries: [{value: 1}, {value: 2}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets: [
            ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
            ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
        ]}
    }
})

// The recipe under test, trained on red and nir.
const consumerOf = (type, {points = [], reuses = [], asset = CONSUMER_ASSET, bandSets = [bands('IMAGE_BANDS', ['red', 'nir'])], auxiliaryImagery} = {}) =>
    recipeOf(type, CONSUMER, {asset, bandSets, points, reuses, auxiliaryImagery})

// A recipe whose training data is reused, storing points of its own unless `points` says otherwise.
const providerOf = (type, id, {asset = assetOf(id), included = ['red', 'nir'], bandSets = [bands('IMAGE_BANDS', included)], points = POINTS, reuses = []} = {}) =>
    recipeOf(type, id, {asset, bandSets, points, reuses})

const lacking = (index, provider, features) =>
    ({path: ['model', 'trainingData', 'dataSets', index], provider, features, recipePath: [CONSUMER]})

const declarationFor = ({type}) => recipeType(type)?.imageOutput

const readinessFor = ({type}) => recipeType(type)

const graphOf = (root, records) =>
    buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))})

// Readiness from what is held now: every asset observed as it holds, or as `observations` say.
const read = (root, records, observations) => readReadiness({
    graph: graphOf(root, records),
    operation: 'IMAGE_OUTPUT',
    declarationFor,
    readinessFor,
    observationFor: ({type, id}) => type === 'ASSET' ? (observations ? observations[id] : observationOf(id)) : undefined
}).readiness

// Readiness settled through the observer, Earth Engine answering each asset as it holds, or failing as `failures` say.
const settled = (root, records, failures) => {
    const observeBands$ = ({reference: {id}}) => failures[id]
        ? throwError(() => failures[id])
        : of(observationOf(id).bands.map(({name}) => ({name, arrayDimensions: 0})))
    let readiness = null
    settledReadiness$({graph: graphOf(root, records), operation: 'IMAGE_OUTPUT', observeBands$, declarationFor, readinessFor})
        .subscribe(result => readiness = result)
    return readiness
}

const featureFindingsOf = readiness => readiness.findings
    .filter(({code}) => code === 'MISSING_TRAINING_FEATURES')
    .map(({path, provider, features, recipePath}) => ({path, provider, features, recipePath}))
