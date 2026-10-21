import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {readImageOutput, readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {dependencyValidity} from '#sepal/recipe/source/dependencyValidity'

// A Classification or Regression trained on another recipe's training data runs that recipe's production of it
// (getTrainingData$, lib/js/ee/src/classification): its input images built and its points sampled over them, with the
// training data its own sets reuse - never its classified image (TRAINING_DATA). So what producing them needs counts
// for the image trained on them, refused at the recipe it concerns, and nothing its image alone needs does: one whose
// points are none is no reason, beside other training data. Codes, roles and types are literals.

for (const type of ['CLASSIFICATION', 'REGRESSION']) {
    describe(`a ${type} trained on another recipe's training data`, () => {
        it('can run where that recipe can produce it', () => {
            assert.equal(read(trainedOn(type, PROVIDER), [provider(type)]).status, 'READY')
        })

        it('cannot run where that recipe\'s input image cannot run, refused at that image', () => {
            const broken = provider(type, {images: [recipeImage(MASKING)]})

            const readiness = read(trainedOn(type, PROVIDER), [broken, MASKING_WITHOUT_MASK, MOSAIC])

            assert.deepEqual(findingsOf(readiness), [{code: 'MISSING_ROLE', recipePath: [CONSUMER, PROVIDER, MASKING]}])
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
        // and nothing of that recipe's own image: a band set its image would be refused for is not judged here.
        it('describes the images it samples over, never that recipe\'s image', () => {
            const selectsMore = provider(type, {images: [{...assetImage, id: PROVIDER_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'swir']}]}]})
            const graph = graphOf(trainedOn(type, PROVIDER), [selectsMore])
            const described = observed => readImageOutput({graph, declarationFor, readinessFor, observationFor: ({id}) => observed[id]})

            assert.deepEqual(described({}).needs.observations.map(({id}) => id).sort(), [INPUT_ASSET, PROVIDER_ASSET].sort())
            assert.equal(described({[INPUT_ASSET]: BANDS, [PROVIDER_ASSET]: BANDS}).readiness.status, 'READY')
        })

        // Needed as an image, it needs training data of its own; needed for its training data, it does not. Needed both
        // ways, it is judged both ways, whichever comes first.
        it('judges a recipe needed both for its training data and as an image both ways', () => {
            const trainer = {...trainedOn(type, PROVIDER), id: 'trainer-1'}
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
const BANDS = {bands: ['red', 'nir'].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]
const MOSAIC = {id: 'mosaic-1', type: 'MOSAIC', model: {}}
const MASKING_WITHOUT_MASK = {id: MASKING, type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: MOSAIC.id}}}

const assetImage = {imageId: 'i-1', type: 'ASSET', id: INPUT_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}
const recipeImage = id => ({imageId: `image-${id}`, type: 'RECIPE_REF', id, bandSetSpecs: []})

// A recipe of `type` over `images`, trained on the points it stores and the recipes it reuses.
const recipeOf = (type, id, {images = [assetImage], points = [], reuses = []} = {}) => ({
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

const provider = (type, {id = PROVIDER, images, points = POINTS, reuses} = {}) => recipeOf(type, id, {images, points, reuses})

const trainedOn = (type, providerId, {points} = {}) => recipeOf(type, CONSUMER, {points, reuses: [providerId]})

const declarationFor = ({type}) => recipeType(type)?.imageOutput

const readinessFor = ({type}) => recipeType(type)

const graphOf = (root, records) =>
    buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))})

const read = (root, records) =>
    readReadiness({graph: graphOf(root, records), operation: 'IMAGE_OUTPUT', declarationFor, readinessFor}).readiness

const findingsOf = readiness => readiness.findings.map(({code, recipePath}) => ({code, recipePath}))
