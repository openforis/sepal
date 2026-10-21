import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The segments a CCDC Slice's or a Change Alerts' chart reads at a pixel (PIXEL_SEGMENTS) are those of the source it
// selects: /ccdc/loadSegments builds a recipe selected as its own image, over its own AOI, and reads an asset as it is.
// So the recipe is judged as its IMAGE_OUTPUT - its own requirements and those of what it builds - and an asset asks
// nothing. Codes, roles and types are literals.

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

            const {readiness} = read(root, [ccdc({aoi: {type: 'ASSET', id: 'users/x/aoi'}}), SVM])

            assert.equal(readiness.status, 'READY')
        })

        it('can be read of a segments asset, needing nothing', () => {
            const root = consumerOf(type, field, {type: 'ASSET', id: 'users/x/segments'})

            assert.deepEqual(read(root, []).readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
        })
    })
}

describe('the segments a CHANGE_ALERTS chart reads, beside the alerts themselves', () => {
    it('can be read though what the alerts monitor keeps the alerts from running', () => {
        const root = consumerOf('CHANGE_ALERTS', 'reference', {type: 'ASSET', id: 'users/x/segments'}, {band: 'probability_1'})

        assert.equal(read(root, [], 'IMAGE_OUTPUT').readiness.status, 'NOT_READY')
        assert.equal(read(root, []).readiness.status, 'READY')
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

const read = (root, records, operation = 'PIXEL_SEGMENTS') => readReadiness({
    graph: buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))}),
    operation,
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type)
})
