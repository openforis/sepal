import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {recordedProperties} from '#sepal/recipe/output/imageOutput'
import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The segments a CCDC Slice's or a Change Alerts' chart reads at a pixel (PIXEL_SEGMENTS) are those of the source it
// selects: /ccdc/loadSegments builds a recipe selected as its own image, over its own AOI, and reads an asset as it is.
// So the recipe is judged as its IMAGE_OUTPUT - its own requirements and those of what it builds - and an asset asks
// nothing. A CCDC selected is held to the Classification its Sources select whatever its breakpoint bands, as its own
// image is (type/ccdc.js), so its chart inherits that: the Classification's input is observed to judge its training.
// Change Alerts plots the segments in the representation, and beside imagery read under the processing, they were
// fitted with (type/changeAlerts.js), so its chart also needs what describes the reference: what a segments asset
// records, or what a CCDC can be asked for. Codes, roles and types are literals.

for (const [type, field] of [['CCDC_SLICE', 'source'], ['CHANGE_ALERTS', 'reference']]) {
    describe(`the segments a ${type} chart reads`, () => {
        it('cannot be read where the recipe selected cannot run itself, refused at that recipe', () => {
            const root = consumerOf(type, field, ref(MASKING))

            const {readiness} = read(root, [masking({imageToMask: ref(CCDC)}), ccdc()])

            assert.equal(readiness.status, 'NOT_READY')
            assert.deepEqual(readiness.findings.map(({code, recipePath}) => ({code, recipePath})), [
                {code: 'MISSING_ROLE', recipePath: [root.id, MASKING]}
            ])
        })

        it('cannot be read where a recipe the selected one builds cannot run, refused at that one', () => {
            const root = consumerOf(type, field, ref(MASKING))

            const {readiness} = read(root, [
                masking({imageToMask: ref(CCDC), imageMask: ref(MOSAIC)}),
                ccdc({breakpointBands: ['regression']}),
                mosaic(),
                SVM
            ])

            assert.deepEqual(readiness.findings.map(({code, recipePath}) => ({code, recipePath})), [
                {code: 'UNSUPPORTED_CLASSIFIED_OUTPUT', recipePath: [root.id, MASKING, CCDC]}
            ])
        })

        it('can be read of a CCDC selected over an AOI of its own, as its image is built', () => {
            const root = consumerOf(type, field, ref(CCDC))

            const {readiness} = read(root, [ccdc({aoi: {type: 'ASSET', id: 'users/x/aoi'}}), SVM], 'PIXEL_SEGMENTS', CLASSIFICATION_INPUT)

            assert.equal(readiness.status, 'READY')
        })

        it('waits for what judging the training of the CCDC\'s Classification observes, its breakpoint bands native', () => {
            const root = consumerOf(type, field, ref(CCDC))

            const {readiness} = read(root, [ccdc(), SVM])

            assert.equal(readiness.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(readiness.needs.observations, [{type: 'ASSET', id: 'users/x/input'}])
        })

        it('cannot be read where the CCDC\'s Classification cannot be trained, its breakpoint bands native, refused at that Classification', () => {
            const root = consumerOf(type, field, ref(CCDC))

            const {readiness} = read(root, [ccdc(), {...SVM, model: {...SVM.model, trainingData: {dataSets: []}}}], 'PIXEL_SEGMENTS', CLASSIFICATION_INPUT)

            assert.deepEqual(readiness.findings.map(({code, recipePath}) => ({code, recipePath})), [
                {code: 'NO_TRAINING_DATA', recipePath: [root.id, CCDC, CLASSIFICATION]}
            ])
        })

        it('can be read of a segments asset, needing nothing more', () => {
            const root = consumerOf(type, field, SEGMENTS_ASSET)

            assert.deepEqual(read(root, []).readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
        })
    })
}

describe('the segments asset a chart reads, not yet observed', () => {
    const UNOBSERVED = {type: 'ASSET', id: 'users/x/unobserved-segments'}

    it('is read as it is by a CCDC_SLICE chart, which needs nothing of it', () => {
        const root = consumerOf('CCDC_SLICE', 'source', UNOBSERVED)

        assert.deepEqual(read(root, []).readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
    })

    it('is waited for by a CHANGE_ALERTS chart, for what it records of its processing', () => {
        const root = consumerOf('CHANGE_ALERTS', 'reference', UNOBSERVED)

        const {readiness} = read(root, [])

        assert.equal(readiness.status, 'NEEDS_EVIDENCE')
        assert.deepEqual(readiness.needs.observations, [UNOBSERVED])
    })
})

describe('the segments a CHANGE_ALERTS chart reads, beside the alerts themselves', () => {
    it('are held to an unusable classified monitoring choice as the alerts are', () => {
        const root = consumerOf('CHANGE_ALERTS', 'reference', SEGMENTS_ASSET, {band: 'probability_1'})

        assert.equal(read(root, [], 'IMAGE_OUTPUT').readiness.status, 'NOT_READY')
        assert.equal(read(root, []).readiness.status, 'NOT_READY')
        assert.equal(read(root, []).readiness.findings[0].code, 'CLASSIFIED_MONITORED_BAND')
        const native = consumerOf('CHANGE_ALERTS', 'reference', SEGMENTS_ASSET)
        assert.equal(read(native, []).readiness.status, 'READY')
    })
})

const MASKING = 'masking-1'
const CCDC = 'ccdc-1'
const MOSAIC = 'mosaic-1'
const CLASSIFICATION = 'classification-1'

// An SVM classifying C_SVC over optical bands Landsat supplies: it provides no regression. It stores points, so a
// classified breakpoint over it is refused for the output alone.
const SVM = {
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend: {entries: [{value: 1}, {value: 2}]},
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]},
        classifier: {type: 'SVM', svmType: 'C_SVC'}
    }
}

const ref = id => ({type: 'RECIPE_REF', id})

const consumerOf = (type, field, selection, sources = {}) => ({
    id: 'consumer-1',
    type,
    model: {[field]: selection, sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'ndvi', ...sources}}
})

const masking = model => ({id: MASKING, type: 'MASKING', model})

const mosaic = () => ({id: MOSAIC, type: 'MOSAIC', model: {}})

const ccdc = ({aoi, breakpointBands = ['ndvi']} = {}) => ({
    id: CCDC,
    type: 'CCDC',
    model: {
        ...(aoi && {aoi}),
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands, classification: CLASSIFICATION},
        options: {corrections: ['SR']}
    }
})

// The Classification's input observed with the bands it selects.
const CLASSIFICATION_INPUT = {'users/x/input': ['red', 'nir']}

const SEGMENTS_ASSET = {type: 'ASSET', id: 'users/x/segments'}

// A segments asset as an observation reads it: its bands, and the properties recording its processing.
const SEGMENTS_OBSERVATION = {
    bands: ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']
        .map(name => ({name, dataType: {arrayDimensions: name === 'ndvi_coefs' ? 2 : 1}})),
    evidence: [recordedProperties({dateFormat: 1, surfaceReflectance: true})]
}

// What a CCDC can be asked for, from its own catalogue.
const CCDC_CATALOGUE = {bands: ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude'].map(name => ({name}))}

// Observed: the segments asset, a CCDC's catalogue, and an asset given bands - the Classification's input.
const read = (root, records, operation = 'PIXEL_SEGMENTS', bandsByAsset = {}) => readReadiness({
    graph: buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))}),
    operation,
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type),
    observationFor: ({type, id}) => {
        if (type !== 'ASSET') {
            return id === CCDC ? CCDC_CATALOGUE : undefined
        }
        return id === SEGMENTS_ASSET.id ? SEGMENTS_OBSERVATION
            : bandsByAsset[id] ? {bands: bandsByAsset[id].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
                : undefined
    }
})
