import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

import {settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// PyEO Alerts builds its baseline as the Classification's own image, and classifies each monitoring scene with the
// classifier that image trains (lib/js/ee/src/pyeo/pyeoAlerts.js): what running that image needs, PyEO needs, found at
// the recipe it concerns. Its input imagery observed, its training data and what reuses it, the features it trains on;
// a supplied decision tree trains on nothing. What is not observed yet, or could not be, is no finding. Codes, roles,
// paths and types are literals.

describe('a PyEO Alerts over a Classification', () => {
    it('can run where the Classification can be built and trained', () => {
        const result = read(pyeo(), [classification()])

        assert.deepEqual(result.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
    })

    it('cannot run where the Classification stores no point, refused at it', () => {
        const result = read(pyeo(), [classification({points: []})])

        assert.deepEqual(findingsOf(result), [{code: 'NO_TRAINING_DATA', recipePath: [PYEO, CLASSIFICATION]}])
    })

    it('can run where the Classification is a supplied decision tree storing no point', () => {
        const result = read(pyeo(), [classification({points: [], classifier: 'DECISION_TREE'})])

        assert.equal(result.readiness.status, 'READY')
    })

    it('cannot run where a recipe the Classification reuses has no input imagery to sample, refused at that recipe', () => {
        const result = read(pyeo(), [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, images: []})])

        assert.deepEqual(findingsOf(result), [{code: 'MISSING_ROLE', recipePath: [PYEO, CLASSIFICATION, PROVIDER]}])
    })

    it('cannot run where the imagery of a recipe the Classification reuses lacks a feature it trains on, refused at it', () => {
        const result = read(pyeo(), [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, included: ['red']})], {
            [assetOf(CLASSIFICATION)]: INPUT_BANDS,
            [assetOf(PROVIDER)]: ['red']
        })

        assert.deepEqual(result.readiness.findings.map(({code, provider, features, recipePath}) => ({code, provider, features, recipePath})), [
            {code: 'MISSING_TRAINING_FEATURES', provider: PROVIDER, features: ['nir'], recipePath: [PYEO, CLASSIFICATION]}
        ])
    })

    it('can run once the Classification stores a point', () => {
        const recipe = pyeo()

        assert.equal(read(recipe, [classification({points: []})]).readiness.status, 'NOT_READY')
        assert.equal(read(recipe, [classification()]).readiness.status, 'READY')
    })
})

describe('the evidence a PyEO Alerts over a Classification acquires', () => {
    it('waits, finding nothing, for the input of the Classification and of the recipe it reuses', () => {
        const result = read(pyeo(), [classification({reuses: [PROVIDER]}), classification({id: PROVIDER})], {})

        assert.equal(result.readiness.status, 'NEEDS_EVIDENCE')
        assert.deepEqual(result.readiness.findings, [])
        assert.deepEqual(result.readiness.needs.observations.map(({id}) => id).sort(), [assetOf(CLASSIFICATION), assetOf(PROVIDER)].sort())
    })

    it('observes nothing of a Classification over a mosaic, described from its configuration', () => {
        const result = read(pyeo(), [classification({images: [MOSAIC_INPUT]}), MOSAIC], {})

        assert.deepEqual(result.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
    })

    it('is unavailable, finding nothing, where the Classification\'s input could not be observed', async () => {
        const result = await settle(pyeo(), [classification()], ({reference: {id}}) => id === assetOf(CLASSIFICATION)
            ? throwError(() => new Error('Earth Engine unreachable'))
            : of(INPUT_BANDS.map(name => ({name, arrayDimensions: 0}))))

        assert.equal(result.readiness.status, 'UNAVAILABLE')
        assert.deepEqual(result.readiness.findings, [])
    })
})

const PYEO = 'pyeo-alerts-1'
const CLASSIFICATION = 'classification-1'
const PROVIDER = 'provider-1'
const INPUT_BANDS = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
const POINTS = [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]

const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}
const MOSAIC_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC.id, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}

const assetOf = id => `users/x/${id}`

// Monitoring Sentinel-2, corrected to surface reflectance, its index gate off.
const pyeo = () => ({
    id: PYEO,
    type: 'PYEO_ALERTS',
    model: {
        sources: {classification: CLASSIFICATION, dataSets: {SENTINEL_2: ['SENTINEL_2']}, changeFromClasses: [1], changeToClasses: [2]},
        options: {corrections: ['SR']},
        pyeoAlertsOptions: {minConsecutiveDetections: 2}
    }
})

// A Classification over an asset of its own, selecting `included` of it, trained on its points and the recipes it reuses.
const classification = ({id = CLASSIFICATION, included = ['red', 'nir'], images, points = POINTS, reuses = [], classifier = 'RANDOM_FOREST'} = {}) => ({
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
