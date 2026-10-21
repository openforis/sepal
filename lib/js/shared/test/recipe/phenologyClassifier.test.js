import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

import {settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// A Phenology whose saved band is one its Classification computes trains that Classification's classifier and applies it
// to every image of its collection (CLASSIFIER, lib/js/ee/src/timeSeries/collection.js): what that needs - the
// Classification's input imagery and band sets, training data, and what reuses it - is needed here, found at the recipe
// it concerns; its image is never built or described for it. A band of the images reads nothing of the Classification
// beyond what its classifier reads of them. Codes, roles, paths and types are literals.

describe('a PHENOLOGY analysing a band its Classification computes', () => {
    it('can run where the Classification can be trained', () => {
        assert.deepEqual(read(phenology(CLASSIFIED), [classification()]).readiness, READY)
    })

    it('cannot run where the Classification stores no point, refused at it', () => {
        const result = read(phenology(CLASSIFIED), [classification({points: []})])

        assert.deepEqual(findingsOf(result), [{code: 'NO_TRAINING_DATA', recipePath: [PHENOLOGY, CLASSIFICATION]}])
    })

    it('cannot run where a recipe the Classification reuses has no input imagery to sample, refused at that recipe', () => {
        const result = read(phenology(CLASSIFIED), [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, images: []})])

        assert.deepEqual(findingsOf(result), [{code: 'MISSING_ROLE', recipePath: [PHENOLOGY, CLASSIFICATION, PROVIDER]}])
    })

    it('cannot run where a recipe the Classification reuses samples fewer features than it trains on, refused at it', () => {
        const result = read(phenology(CLASSIFIED), [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, included: ['red']})])

        assert.deepEqual(result.readiness.findings.map(({code, provider, features, recipePath}) => ({code, provider, features, recipePath})), [
            {code: 'MISSING_TRAINING_FEATURES', provider: PROVIDER, features: ['nir'], recipePath: [PHENOLOGY, CLASSIFICATION]}
        ])
    })

    it('refuses a band its Classification\'s input lacks once, at the Classification, without describing its image', () => {
        const result = read(phenology(CLASSIFIED), [classification({included: ['red', 'swir1']})])

        assert.deepEqual(result.diagnostics, [])
        assert.deepEqual(findingsOf(result), [{code: 'MISSING_INPUT_BAND', recipePath: [PHENOLOGY, CLASSIFICATION]}])
    })

    it('is refused only for the output a supplied decision tree does not provide, not for its training data', () => {
        const result = read(phenology(CLASSIFIED), [classification({points: [], classifier: 'DECISION_TREE'})])

        assert.deepEqual(result.readiness.findings.map(({code}) => code), ['UNSUPPORTED_CLASSIFIED_OUTPUT'])
    })

    it('cannot run over a recipe that trains no classifier for other imagery', () => {
        const result = read(phenology(CLASSIFIED), [{...classification(), type: 'REGRESSION'}])

        assert.deepEqual(findingsOf(result).filter(({code}) => code === 'UNDECLARED_OPERATION'), [
            {code: 'UNDECLARED_OPERATION', recipePath: [PHENOLOGY, CLASSIFICATION]}
        ])
    })

    it('can run once the Classification stores a point', () => {
        const recipe = phenology(CLASSIFIED)

        assert.equal(read(recipe, [classification({points: []})]).readiness.status, 'NOT_READY')
        assert.equal(read(recipe, [classification()]).readiness.status, 'READY')
    })
})

describe('the evidence a PHENOLOGY analysing a band its Classification computes acquires', () => {
    it('waits, finding nothing, for the input of the Classification and of the recipe it reuses', () => {
        const result = read(phenology(CLASSIFIED), [classification({reuses: [PROVIDER]}), classification({id: PROVIDER})], {})

        assert.equal(result.readiness.status, 'NEEDS_EVIDENCE')
        assert.deepEqual(result.readiness.findings, [])
        assert.deepEqual(result.readiness.needs.observations.map(({id}) => id).sort(), [assetOf(CLASSIFICATION), assetOf(PROVIDER)].sort())
    })

    it('waits for the Classification while it is not held', () => {
        assert.deepEqual(read(phenology(CLASSIFIED), []).readiness.needs.records, [CLASSIFICATION])
    })

    it('is unavailable, finding nothing, where the Classification\'s input could not be observed', async () => {
        const result = await settle(phenology(CLASSIFIED), [classification()], ({reference: {id}}) => id === assetOf(CLASSIFICATION)
            ? throwError(() => new Error('Earth Engine unreachable'))
            : of(INPUT_BANDS.map(name => ({name, arrayDimensions: 0}))))

        assert.equal(result.readiness.status, 'UNAVAILABLE')
        assert.deepEqual(result.readiness.findings, [])
    })
})

describe('a PHENOLOGY analysing a band of the images', () => {
    for (const [_case, records] of [
        ['stores no point', () => [classification({points: []})]],
        ['reuses a recipe without input imagery', () => [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, images: []})]],
        ['reuses a recipe sampling fewer features', () => [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, included: ['red']})]]
    ]) {
        it(`can run, observing nothing of it, where its Classification ${_case}`, () => {
            assert.deepEqual(read(phenology('ndvi'), records(), {}).readiness, READY)
        })
    }
})

const PHENOLOGY = 'phenology-1'
const CLASSIFICATION = 'classification-1'
const PROVIDER = 'provider-1'
const CLASSIFIED = 'probability_1'
const INPUT_BANDS = ['red', 'nir']
const POINTS = [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]
const READY = {status: 'READY', findings: [], needs: {records: [], observations: []}}

const assetOf = id => `users/x/${id}`

// Over Landsat scenes, its band as given.
const phenology = band => ({
    id: PHENOLOGY,
    type: 'PHENOLOGY',
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {fromYear: 2020, toYear: 2021},
        sources: {classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, band},
        options: {corrections: ['SR']}
    }
})

// A Classification over an asset of its own, selecting `included` of it, trained on its points and the recipes it reuses.
const classification = ({id = CLASSIFICATION, included = INPUT_BANDS, images, points = POINTS, reuses = [], classifier = 'RANDOM_FOREST'} = {}) => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: images ?? [{imageId: 'i-1', type: 'ASSET', id: assetOf(id), bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
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

const declarationFor = ({type}) => recipeType(type)?.imageOutput

const readinessFor = ({type}) => recipeType(type)

// The output read from what the session holds: every asset observed holding INPUT_BANDS, unless `observations` says.
const read = (root, records, observations) => readImageOutput({
    graph: graphOf(root, records),
    declarationFor,
    readinessFor,
    observationFor: ({type, id}) => {
        const bands = type === 'ASSET' && (observations ? observations[id] : INPUT_BANDS)
        return bands ? {bands: bands.map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []} : undefined
    }
})

// Settled through the observer, Earth Engine answering each observation as `observeBands$` says.
const settle = (root, records, observeBands$) =>
    firstValueFrom(settledImageOutput$({graph: graphOf(root, records), observeBands$, declarationFor, readinessFor}))

const findingsOf = result => result.readiness.findings.map(({code, recipePath}) => ({code, recipePath}))
