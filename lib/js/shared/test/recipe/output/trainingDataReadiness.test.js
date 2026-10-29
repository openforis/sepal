import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {of, throwError} from 'rxjs'

import {settledReadiness$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput, readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {dependencyValidity} from '#sepal/recipe/source/dependencyValidity'

// A Classification or Regression trained on another recipe's training data runs that recipe's production of it
// (getSamples$, lib/js/ee/src/classification): its input images built and the features the recipe trained on them are
// sampled of them at its points, with the training data its own sets reuse - never its classified image (TRAINING_DATA).
// So what producing them needs counts for the image trained on them, refused at the recipe it concerns, and nothing its
// image alone needs does: one whose points are none is no reason, beside other training data, and neither is what its
// own band sets select, which it does not sample for another (trainingFeatures.test.js judges what it supplies). An
// input not yet observed, or that could not be, establishes nothing. Codes, roles, paths and types are literals.

for (const type of ['CLASSIFICATION', 'REGRESSION']) {
    describe(`a ${type} trained on another recipe's training data`, () => {
        it('can run where that recipe can produce it', () => {
            assert.equal(read(trainedOn(type, PROVIDER), [provider(type)]).status, 'READY')
        })

        it('cannot run where that recipe\'s input image cannot run, refused at that image', () => {
            const broken = provider(type, {images: [recipeImage(MASKING)]})

            const readiness = read(trainedOn(type, PROVIDER), [broken, MASKING_WITHOUT_MASK, MOSAIC])

            // Described from a mosaic of nothing, that image supplies nothing either, which is found as it is.
            assert.deepEqual(findingsOf(readiness).filter(({code}) => code !== 'MISSING_TRAINING_FEATURES'), [
                {code: 'MISSING_ROLE', recipePath: [CONSUMER, PROVIDER, MASKING]}
            ])
        })

        it('cannot run where that recipe has no input imagery to sample, refused at it', () => {
            const readiness = read(trainedOn(type, PROVIDER), [provider(type, {images: []})])

            assert.deepEqual(findingsOf(readiness), [{code: 'MISSING_ROLE', recipePath: [CONSUMER, PROVIDER]}])
        })

        it('cannot run where the training data that recipe itself reuses cannot be produced, refused where it cannot', () => {
            const nested = provider(type, {id: NESTED, images: []})

            const readiness = read(trainedOn(type, PROVIDER), [provider(type, {reuses: [NESTED]}), nested])

            assert.deepEqual(findingsOf(readiness), [{code: 'MISSING_ROLE', recipePath: [CONSUMER, PROVIDER, NESTED]}])
        })

        for (const [_case, bandSet] of [
            ['a band its input does not have', ['IMAGE_BANDS', 'red', 'swir']],
            ['an index its input cannot derive', ['INDEXES', 'ndmi']],
            ['bands to combine its input has fewer than two of', ['PAIR_WISE_EXPRESSION', 'red', 'swir']]
        ]) {
            it(`can run where that recipe selects ${_case}, as it does not sample its own selections for another`, () => {
                assert.equal(read(trainedOn(type, PROVIDER), [provider(type, {bandSets: [bands(...bandSet)]})]).status, 'READY')
            })
        }

        it('can run where the training data that recipe reuses selects a band its input does not have', () => {
            const nested = provider(type, {id: NESTED, bandSets: [bands('IMAGE_BANDS', 'swir')]})

            assert.equal(read(trainedOn(type, PROVIDER), [provider(type, {reuses: [NESTED]}), nested]).status, 'READY')
        })

        it('waits, finding nothing, while that recipe\'s input is not yet observed', () => {
            const readiness = read(trainedOn(type, PROVIDER), [provider(type, {bandSets: SELECTING_SWIR})], {[INPUT_ASSET]: OBSERVED[INPUT_ASSET]})

            assert.equal(readiness.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(readiness.findings, [])
            assert.deepEqual(readiness.needs.observations.map(({id}) => id), [PROVIDER_ASSET])
        })

        it('is unavailable, finding nothing, where that recipe\'s input could not be observed', () => {
            const readiness = settled(trainedOn(type, PROVIDER), [provider(type, {bandSets: SELECTING_SWIR})], {
                [PROVIDER_ASSET]: new Error('Earth Engine unreachable')
            })

            assert.equal(readiness.status, 'UNAVAILABLE')
            assert.deepEqual(readiness.findings, [])
        })

        it('can run once that recipe\'s input is observed holding the band it selects', () => {
            const readiness = read(trainedOn(type, PROVIDER), [provider(type, {bandSets: SELECTING_SWIR})], {
                ...OBSERVED,
                [PROVIDER_ASSET]: observed('red', 'nir', 'swir')
            })

            assert.equal(readiness.status, 'READY')
        })

        it('can run trained on its own points beside a recipe that contributes none', () => {
            const readiness = read(trainedOn(type, PROVIDER, {points: POINTS}), [provider(type, {points: []})])

            assert.equal(readiness.status, 'READY')
        })

        it('cannot run trained on a recipe of a type that produces no training data', () => {
            const readiness = read(trainedOn(type, MOSAIC.id), [MOSAIC])

            assert.deepEqual(findingsOf(readiness), [{code: 'UNDECLARED_OPERATION', recipePath: [CONSUMER, MOSAIC.id]}])
        })

        it('waits for that recipe, and for what it samples over, while they are not held', () => {
            assert.deepEqual(read(trainedOn(type, PROVIDER), []).needs.records, [PROVIDER])
            assert.deepEqual(read(trainedOn(type, PROVIDER), [provider(type, {images: [recipeImage(MOSAIC.id)]})]).needs.records, [MOSAIC.id])
        })

        // Producing training data needs the images it samples, described where the output read describes what it builds,
        // and nothing of that recipe's own image: described, its image would be refused for a band its own band sets
        // select that its input lacks, which producing training data for another is not.
        it('describes the images it samples over, never that recipe\'s image', () => {
            const graph = graphOf(trainedOn(type, PROVIDER), [provider(type, {bandSets: [bands('IMAGE_BANDS', 'red', 'swir')]})])
            const described = observations => readImageOutput({graph, declarationFor, readinessFor, observationFor: ({id}) => observations[id]})

            assert.deepEqual(described({}).needs.observations.map(({id}) => id).sort(), [INPUT_ASSET, PROVIDER_ASSET].sort())
            assert.deepEqual(findingsOf(described(OBSERVED).readiness), [])
        })

        // Needed as an image, it needs training data of its own; needed for its training data, it does not. Needed both
        // ways, it is judged both ways, whichever comes first.
        it('judges a recipe needed both for its training data and as an image both ways', () => {
            const trainer = {...trainedOn(type, PROVIDER, {points: POINTS}), id: 'trainer-1'}
            const consumer = {...trainedOn(type, PROVIDER, {points: POINTS}), model: {
                ...trainedOn(type, PROVIDER, {points: POINTS}).model,
                inputImagery: {images: [recipeImage(trainer.id), recipeImage(PROVIDER)]}
            }}

            const readiness = read(consumer, [trainer, provider(type, {points: []})])

            assert.deepEqual(findingsOf(readiness), [{code: 'NO_TRAINING_DATA', recipePath: [CONSUMER, PROVIDER]}])
        })

        it('is refused for training data that reuses itself, its dependencies unsound, without looping', () => {
            const a = {...trainedOn(type, 'b'), id: 'a'}
            const b = {...trainedOn(type, 'a'), id: 'b'}

            assert.equal(dependencyValidity({status: 'COMPLETE', graph: graphOf(a, [b])}).status, 'INVALID')
            assert.equal(read(a, [b]).status, 'READY')
        })
    })
}

const CONSUMER = 'consumer-1'
const PROVIDER = 'provider-1'
const NESTED = 'nested-1'
const MASKING = 'masking-1'
const INPUT_ASSET = 'users/x/input'
const PROVIDER_ASSET = 'users/x/provider-input'
const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]
const MOSAIC = {id: 'mosaic-1', type: 'MOSAIC', model: {}}
const MASKING_WITHOUT_MASK = {id: MASKING, type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: MOSAIC.id}}}

// An asset as observed holding these bands.
const observed = (...names) => ({bands: names.map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []})

const OBSERVED = {[INPUT_ASSET]: observed('red', 'nir'), [PROVIDER_ASSET]: observed('red', 'nir')}

const bands = (type, ...included) => ({id: `${type}-set`, type, included})

// Beside what the consumer trains on, a band the provider's input is observed holding or not, as each case says.
const SELECTING_SWIR = [bands('IMAGE_BANDS', 'red', 'nir', 'swir')]

const assetImage = (id, bandSets) => ({imageId: 'i-1', type: 'ASSET', id, bandSetSpecs: bandSets})
const recipeImage = id => ({imageId: `image-${id}`, type: 'RECIPE_REF', id, bandSetSpecs: []})

// A recipe of `type` over `images`, trained on the points it stores and the recipes it reuses.
const recipeOf = (type, id, {images, points = [], reuses = []}) => ({
    id,
    type,
    model: {
        inputImagery: {images},
        legend: {entries: [{value: 1}, {value: 2}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets: [
            ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
            ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
        ]}
    }
})

// A recipe whose training data is reused: over its own asset, selecting `bandSets` of it.
const provider = (type, {id = PROVIDER, bandSets = [bands('IMAGE_BANDS', 'red', 'nir')], images = [assetImage(PROVIDER_ASSET, bandSets)], points = POINTS, reuses} = {}) =>
    recipeOf(type, id, {images, points, reuses})

const trainedOn = (type, providerId, {points} = {}) =>
    recipeOf(type, CONSUMER, {images: [assetImage(INPUT_ASSET, [bands('IMAGE_BANDS', 'red', 'nir')])], points, reuses: [providerId]})

const declarationFor = ({type}) => recipeType(type)?.imageOutput

const readinessFor = ({type}) => recipeType(type)

const graphOf = (root, records) =>
    buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))})

// Readiness from what is held now, the assets observed as `observations` say.
const read = (root, records, observations = OBSERVED) => readReadiness({
    graph: graphOf(root, records),
    operation: 'IMAGE_OUTPUT',
    declarationFor,
    readinessFor,
    observationFor: ({type, id}) => type === 'ASSET' ? observations[id] : undefined
}).readiness

// Readiness settled through the observer, Earth Engine answering each asset as `answers` say, or failing with an Error.
const settled = (root, records, answers) => {
    const observeBands$ = ({reference: {id}}) => answers[id] instanceof Error
        ? throwError(() => answers[id])
        : of((answers[id] || observed('red', 'nir')).bands.map(({name}) => ({name, arrayDimensions: 0})))
    let readiness = null
    settledReadiness$({graph: graphOf(root, records), operation: 'IMAGE_OUTPUT', observeBands$, declarationFor, readinessFor})
        .subscribe(result => readiness = result)
    return readiness
}

const findingsOf = readiness => readiness.findings.map(({code, recipePath}) => ({code, recipePath}))
