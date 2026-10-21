import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {format} from 'node:util'

import {of, throwError} from 'rxjs'

import {settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Classification, Regression and Unsupervised Classification are described once their input images are, and refused
// where an image's band sets select what its source's current description does not provide - located at the selection
// or band set, whatever another input still awaits. What could not be described establishes nothing. Codes, statuses
// and persisted field names are literals.

for (const type of ['CLASSIFICATION', 'REGRESSION', 'UNSUPERVISED_CLASSIFICATION']) {
    describe(format('a %s recipe', type), () => {
        it('is refused at a selected band its input lacks', () => {
            const result = read(recipeOf(type, [image('i-1', DEM, [imageBands('elevation', 'slope')])]), {[DEM]: ['elevation']})

            assert.equal(result.status, 'INVALID')
            assert.deepEqual(result.diagnostics, [
                {code: 'MISSING_INPUT_BAND', path: [...IMAGES, 0, 'bandSetSpecs', 0, 'included', 1], recipePath: ['recipe-1']}
            ])
        })

        it('is described once every input provides what its band sets select', () => {
            const result = read(recipeOf(type, [image('i-1', DEM, [imageBands('elevation')])]), {[DEM]: ['elevation', 'slope']})

            assert.equal(result.status, 'READY')
        })

        it('needs an input not yet described, finding nothing missing meanwhile', () => {
            const result = read(recipeOf(type, [image('i-1', DEM, [imageBands('elevation')])]), {})

            assert.equal(result.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(result.diagnostics.map(({code}) => code), ['UNAVAILABLE_DESCRIPTION'])
        })
    })
}

describe('a Classification recipe with one input lacking a band and another not described', () => {
    it('is refused at the band established missing, still naming the input it needs', () => {
        const recipe = recipeOf('CLASSIFICATION', [
            image('i-1', DEM, [imageBands('elevation')]),
            image('i-2', WATER, [ratio('occurrence', 'seasonality')])
        ])

        const result = read(recipe, {[WATER]: ['occurrence']})

        assert.equal(result.status, 'INVALID')
        assert.deepEqual(result.diagnostics.filter(({code}) => code !== 'UNAVAILABLE_DESCRIPTION'), [
            {code: 'MISSING_INPUT_BAND', path: [...IMAGES, 1, 'bandSetSpecs', 0, 'included', 1], recipePath: ['recipe-1']},
            {code: 'INSUFFICIENT_INPUT_BANDS', path: [...IMAGES, 1, 'bandSetSpecs', 0], recipePath: ['recipe-1']}
        ])
        assert.deepEqual(result.needs.observations, [{type: 'ASSET', id: DEM}])
    })

    it('keeps that refusal once the other input fails to be observed', () => {
        const recipe = recipeOf('CLASSIFICATION', [
            image('i-1', DEM, [imageBands('elevation')]),
            image('i-2', WATER, [imageBands('seasonality')])
        ])

        const result = settle(recipe, {[DEM]: new Error('Earth Engine unreachable'), [WATER]: ['occurrence']})

        assert.equal(result.status, 'INVALID')
        assert.deepEqual(result.diagnostics.filter(({code}) => code === 'MISSING_INPUT_BAND'), [
            {code: 'MISSING_INPUT_BAND', path: [...IMAGES, 1, 'bandSetSpecs', 0, 'included', 0], recipePath: ['recipe-1']}
        ])
    })
})

describe('a Classification recipe trained on another recipe', () => {
    it('is described without reading what it is trained on, and waits for that recipe to know whether it can run', () => {
        const recipe = recipeOf('CLASSIFICATION', [image('i-1', DEM, [imageBands('elevation')])], {
            trainingData: {dataSets: [{type: 'COLLECTED', referenceData: []}, {type: 'RECIPE', recipe: 'not-loaded'}]}
        })

        const result = read(recipe, {[DEM]: ['elevation']})

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.readiness, {status: 'NEEDS_EVIDENCE', findings: [], needs: {records: ['not-loaded'], observations: []}})
    })
})

describe('a Classification recipe without training data', () => {
    it('is described with its classifier\'s bands, and cannot run', () => {
        const recipe = recipeOf('CLASSIFICATION', [image('i-1', DEM, [imageBands('elevation')])], {trainingData: NO_TRAINING_DATA})

        const result = read(recipe, {[DEM]: ['elevation']})

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.readiness, {
            status: 'NOT_READY',
            findings: [{code: 'NO_TRAINING_DATA', path: ['model', 'trainingData', 'dataSets'], recipePath: ['recipe-1']}],
            needs: {records: [], observations: []}
        })
    })

    it('cannot run, found from its configuration alone while its input is not yet described, which it still needs', () => {
        const recipe = recipeOf('CLASSIFICATION', [image('i-1', DEM, [imageBands('elevation')])], {trainingData: NO_TRAINING_DATA})

        const result = read(recipe, {})

        assert.equal(result.status, 'NEEDS_EVIDENCE')
        assert.equal(result.readiness.status, 'NOT_READY')
        assert.deepEqual(result.readiness.findings.map(({code}) => code), ['NO_TRAINING_DATA'])
        assert.deepEqual(result.readiness.needs.observations, [{type: 'ASSET', id: DEM}])
    })

    it('cannot run for that and for a band its input lacks, which its description is refused for', () => {
        const recipe = recipeOf('CLASSIFICATION', [image('i-1', DEM, [imageBands('slope')])], {trainingData: {dataSets: []}})

        const result = read(recipe, {[DEM]: ['elevation']})

        assert.equal(result.status, 'INVALID')
        assert.deepEqual(result.readiness.findings.map(({code}) => code), ['MISSING_INPUT_BAND', 'NO_TRAINING_DATA'])
    })

    it('can run once a data set stores a point', () => {
        const recipe = recipeOf('CLASSIFICATION', [image('i-1', DEM, [imageBands('elevation')])], {
            trainingData: {dataSets: [{type: 'COLLECTED', referenceData: []}, {type: 'CSV_UPLOAD', referenceData: [POINT]}]}
        })

        assert.equal(read(recipe, {[DEM]: ['elevation']}).readiness.status, 'READY')
    })

    it('can run where its classifier is a supplied decision tree, which is not trained', () => {
        const recipe = recipeOf('CLASSIFICATION', [image('i-1', DEM, [imageBands('elevation')])], {
            classifier: {type: 'DECISION_TREE', decisionTree: '1) root 9 0 0 (0 1) *'},
            trainingData: NO_TRAINING_DATA
        })

        assert.equal(read(recipe, {[DEM]: ['elevation']}).readiness.status, 'READY')
    })
})

const DEM = 'users/x/dem'
const WATER = 'users/x/water'
const IMAGES = ['model', 'inputImagery', 'images']
const POINT = {x: 0.5, y: 0.5, class: 1}
const NO_TRAINING_DATA = {dataSets: [{type: 'COLLECTED', referenceData: []}]}

const imageBands = (...included) => ({id: 'image-bands', type: 'IMAGE_BANDS', included})
const ratio = (...included) => ({id: 'ratio', type: 'PAIR_WISE_EXPRESSION', operation: 'RATIO', included})

const image = (imageId, asset, bandSetSpecs) => ({imageId, type: 'ASSET', id: asset, bandSetSpecs})

const recipeOf = (type, images, model = {}) => ({
    id: 'recipe-1',
    type,
    model: {
        inputImagery: {images},
        classifier: {type: 'RANDOM_FOREST'},
        legend: {entries: []},
        trainingData: {dataSets: [{type: 'COLLECTED', referenceData: [POINT]}]},
        ...model
    }
})

const declarationFor = ({type}) => recipeType(type)?.imageOutput

const readinessFor = ({type}) => recipeType(type)

const graphOf = recipe => buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])})

// What can be said from the bands held for each input asset.
const read = (recipe, bandsByAsset) => readImageOutput({
    graph: graphOf(recipe),
    declarationFor,
    readinessFor,
    observationFor: ({type, id}) => type === 'ASSET' && bandsByAsset[id]
        ? {bands: bandsByAsset[id].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
        : undefined
})

// Settled through the observer, Earth Engine answering each asset with its bands, or failing with an Error.
const settle = (recipe, answers) => {
    const observeBands$ = ({reference: {id}}) => answers[id] instanceof Error
        ? throwError(() => answers[id])
        : of(answers[id].map(name => ({name, arrayDimensions: 0})))
    let settled = null
    settledImageOutput$({graph: graphOf(recipe), observeBands$, declarationFor}).subscribe(result => settled = result)
    return settled
}
