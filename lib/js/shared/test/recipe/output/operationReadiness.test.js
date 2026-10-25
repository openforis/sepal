import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

import {settledReadiness$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput, readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Whether one operation over a recipe can run, asked apart from describing its image output: the requirements and
// needs its type declares for that operation, and nothing of the root described. What a requirement asks of its inputs
// is still acquired, and fails, as any read's is - a CCDC's selected Classification's input among them, observed to judge
// the training every CCDC operation needs of it (type/ccdc.js). Codes, statuses, operations and roles are literals.

describe('reading whether a CCDC\'s pixel observations can run', () => {
    it('is refused at the classification where nothing the scenes or the radar collection carry could feed its classifier, asking nothing but its input', () => {
        const recipe = ccdc()

        const result = readReadiness({...over(recipe, [classification(RADAR_FEATURES)]), operation: 'PIXEL_OBSERVATIONS'})

        assert.equal(result.readiness.status, 'NOT_READY')
        assert.deepEqual(result.readiness.findings.map(({code, path, recipePath}) => [code, path, recipePath]), [
            ['UNSUPPLIED_CLASSIFIER_INPUTS', ['model', 'sources', 'classification'], [recipe.id]]
        ])
        assert.deepEqual(result.needs, {records: [], observations: [{type: 'ASSET', id: INPUT}]})
    })

    it('can run where the scenes can feed it and the classification can be trained, without the catalogue describing its image would observe', () => {
        const recipe = ccdc()
        const graph = over(recipe, [classification(OPTICAL_FEATURES)])

        const result = readReadiness({...graph, operation: 'PIXEL_OBSERVATIONS', observationFor: inputWith(OPTICAL_FEATURES)})

        assert.deepEqual(result.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
        assert.deepEqual(readImageOutput(graph).needs.observations, [{type: 'RECIPE_REF', id: recipe.id}, {type: 'ASSET', id: INPUT}])
    })

    it('settles asking Earth Engine for nothing but the classification\'s input, to judge its training', async () => {
        const readiness = await firstValueFrom(settledReadiness$({
            ...over(ccdc(), [classification(OPTICAL_FEATURES)]),
            operation: 'PIXEL_OBSERVATIONS',
            observeBands$: ({reference}) => reference.id === INPUT
                ? of(OPTICAL_FEATURES.map(name => ({name, arrayDimensions: 0})))
                : throwError(() => new Error(`Observed ${reference.id}`))
        }))

        assert.equal(readiness.status, 'READY')
    })
})

describe('reading an operation a recipe\'s type declares nothing for', () => {
    it('is not ready, though no requirement of the type applies to it', () => {
        const result = readReadiness({...over(MOSAIC, []), operation: 'PIXEL_OBSERVATIONS'})

        assert.equal(result.readiness.status, 'NOT_READY')
        assert.deepEqual(result.readiness.findings, [
            {code: 'UNDECLARED_OPERATION', operation: 'PIXEL_OBSERVATIONS', path: [], recipePath: [MOSAIC.id]}
        ])
    })
})

// A Remapping declared, for this operation, to need only that its input resolves, and to require the band its
// constraint reads - the one requirement asking for its input's observed bands.
describe('an operation whose requirement needs an input\'s observed bands', () => {
    it('waits for that observation', () => {
        const result = readReadiness({...over(remapping(), [], observingRemapping), operation: 'PIXEL_OBSERVATIONS'})

        assert.equal(result.readiness.status, 'NEEDS_EVIDENCE')
        assert.deepEqual(result.needs.observations, [{type: 'ASSET', id: DEM}])
    })

    it('judges the band once it is observed', () => {
        const graph = over(remapping(), [], observingRemapping)
        const answered = bands => readReadiness({...graph, operation: 'PIXEL_OBSERVATIONS', observationFor: demWith(bands)})

        assert.equal(answered(['elevation']).readiness.status, 'READY')
        assert.deepEqual(answered(['slope']).readiness.findings.map(({code}) => code), ['MISSING_INPUT_BAND'])
    })

    it('settles as unavailable, not as a finding, where the observation fails', async () => {
        const failure = new Error('Asset could not be read')

        const readiness = await firstValueFrom(settledReadiness$({
            ...over(remapping(), [], observingRemapping),
            operation: 'PIXEL_OBSERVATIONS',
            observeBands$: () => throwError(() => failure)
        }))

        assert.equal(readiness.status, 'UNAVAILABLE')
        assert.deepEqual(readiness.findings, [])
        assert.deepEqual(readiness.failures, [failure])
    })

    it('settles once the observation answers', async () => {
        const readiness = await firstValueFrom(settledReadiness$({
            ...over(remapping(), [], observingRemapping),
            operation: 'PIXEL_OBSERVATIONS',
            observeBands$: () => of([{name: 'elevation', arrayDimensions: 0}])
        }))

        assert.equal(readiness.status, 'READY')
    })

    it('asks for nothing where no requirement of the operation reads the input', () => {
        const result = readReadiness({...over(remapping(), [], declaringOnly), operation: 'PIXEL_OBSERVATIONS'})

        assert.deepEqual(result.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
    })
})

// A Masking of an image the operation builds, masked by an asset: running it builds both, so each is judged by its own
// image output's requirements - and, read for whether it can run alone, neither is described for it.
describe('reading whether a recipe\'s image can run, describing nothing it builds', () => {
    it('is refused for the CCDC it masks, observing neither the CCDC nor the mask, only its classification\'s input', () => {
        const ccdcRecipe = ccdc()
        const recipe = masking(ccdcRecipe.id)
        const graph = over(recipe, [ccdcRecipe, classification(RADAR_FEATURES)])

        const result = readReadiness({...graph, operation: 'IMAGE_OUTPUT'})

        assert.deepEqual(result.readiness.findings.map(({code, recipePath}) => [code, recipePath]), [
            ['UNSUPPLIED_CLASSIFIER_INPUTS', [recipe.id, ccdcRecipe.id]]
        ])
        assert.deepEqual(result.needs.observations, [{type: 'ASSET', id: INPUT}])
        assert.deepEqual(readImageOutput(graph).needs.observations.map(({id}) => id).sort(), [ccdcRecipe.id, INPUT, 'users/x/mask'].sort())
    })

    it('can run once the CCDC\'s classification is one its scenes can feed, observing only its input', () => {
        const ccdcRecipe = ccdc()

        const result = readReadiness({
            ...over(masking(ccdcRecipe.id), [ccdcRecipe, classification(OPTICAL_FEATURES)]),
            operation: 'IMAGE_OUTPUT',
            observationFor: inputWith(OPTICAL_FEATURES)
        })

        assert.deepEqual(result.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
    })

    it('still observes what a requirement of a recipe it builds reads, and judges it once observed', () => {
        const graph = over(masking(remapping().id), [remapping()])

        assert.deepEqual(readReadiness({...graph, operation: 'IMAGE_OUTPUT'}).needs.observations, [{type: 'ASSET', id: DEM}])
        assert.deepEqual(
            readReadiness({...graph, operation: 'IMAGE_OUTPUT', observationFor: demWith(['slope'])}).readiness.findings.map(({code}) => code),
            ['MISSING_INPUT_BAND']
        )
    })
})

const CLASSIFICATION = 'classification-1'
const DEM = 'users/x/dem'
const RADAR_FEATURES = ['VV_mean', 'VH_med']

const ccdc = () => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        dates: {startDate: '2015-01-01', endDate: '2020-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], classification: CLASSIFICATION},
        options: {corrections: ['SR']}
    }
})

const INPUT = 'users/x/input'
const OPTICAL_FEATURES = ['red', 'nir', 'ndvi']

// Trained on points over `included` of an asset: every CCDC operation trains it (type/ccdc.js).
const classification = included => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: INPUT, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
        legend: {entries: [{value: 1}, {value: 2}]},
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]},
        classifier: {type: 'RANDOM_FOREST'}
    }
})

const inputWith = bands => ({type, id}) => type === 'ASSET' && id === INPUT
    ? {bands: bands.map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
    : undefined

const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}

// Masked by an asset, which is observed only where something reads it.
const masking = imageId => ({
    id: 'masking-1',
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: imageId}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
})

// Forest where the DEM's elevation is 1.
const remapping = () => ({
    id: 'remapping-1',
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [{imageId: 'r-1', type: 'ASSET', id: DEM, includedBands: [{band: 'elevation'}]}]},
        legend: {entries: [{value: 1, constraints: [{image: 'r-1', band: 'elevation', operator: '=', value: 1}]}]}
    }
})

const declaringOnly = definition => definition.type === 'REMAPPING'
    ? {...definition, executionNeeds: {...definition.executionNeeds, PIXEL_OBSERVATIONS: {INPUT_IMAGE: 'REFERENCE'}}}
    : definition

const observingRemapping = definition => definition.type === 'REMAPPING'
    ? {
        ...declaringOnly(definition),
        configurationRequirements: definition.configurationRequirements.map(rule => rule.code === 'MISSING_INPUT_BAND'
            ? {...rule, operations: [...rule.operations, 'PIXEL_OBSERVATIONS']}
            : rule)
    }
    : definition

const demWith = bands => ({type, id}) => type === 'ASSET' && id === DEM
    ? {bands: bands.map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
    : undefined

// The graph and declarations a read is given: each type's definition, as `adapt` changes it.
const over = (root, records, adapt = definition => definition) => ({
    graph: buildRecipeDependencyGraph({
        rootRecipe: root,
        recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))
    }),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => adapt(recipeType(type))
})
