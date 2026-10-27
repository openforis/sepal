import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {defineRecipeType} from '#sepal/recipe/defineRecipeType'
import {NO_IMAGE_OUTPUT} from '#sepal/recipe/output/provider'
import {readImageOutput, readReadiness} from '#sepal/recipe/output/readImageOutput'
import {judgesMapProduct} from '#sepal/recipe/output/readiness'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// What a type's configured analysis needs whatever runs it (analysisPrerequisites, output/readiness.js): every operation
// it declares and every map product it names is held to them, an operation adding its own. A named product is judged by
// them without its canonical image being described: CCDC's count needs its Classification trainable, observing what
// training reads, never the collection the segments image is described from. A product of a type declaring none is not
// judged. The per-operation refusals over Time Series and CCDC are classifiedOutputTraining.test.js. Codes, roles and
// types are literals.

describe('the count map product of a CCDC selecting a trainable Classification', () => {
    it('can run once what training reads is observed, though the collection its image is described from is not', () => {
        const observationFor = ({id}) => id === INPUT_ASSET ? observed(['red', 'nir']) : undefined

        const count = readReadiness({graph: graph(), operation: 'COUNT', declarationFor, readinessFor, observationFor})
        const image = readImageOutput({graph: graph(), declarationFor, readinessFor, observationFor})

        assert.deepEqual(count.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
        assert.deepEqual(image.needs.observations, [{type: 'RECIPE_REF', id: CCDC}])
    })

    it('needs only what training reads while that is not observed', () => {
        const count = readReadiness({graph: graph(), operation: 'COUNT', declarationFor, readinessFor, observationFor: () => undefined})

        assert.equal(count.readiness.status, 'NEEDS_EVIDENCE')
        assert.deepEqual(count.readiness.needs.observations, [{type: 'ASSET', id: INPUT_ASSET}])
    })
})

describe('a map product', () => {
    for (const [type, product] of [['CCDC', 'COUNT'], ['CHANGE_ALERTS', 'COLLECTION_MOSAIC']]) {
        it(`of ${type} is judged where its type declares analysis prerequisites`, () => {
            assert.equal(judgesMapProduct(recipeType(type), product), true)
        })
    }

    for (const [type, product] of [['LANDTRENDR', 'ANNUAL_MOSAIC'], ['BAYTS_ALERTS', 'RADAR_OBSERVATION']]) {
        it(`of ${type}, declaring none, is not judged`, () => {
            assert.ok(Object.hasOwn(recipeType(type).mapProducts, product), `${type} names no ${product}`)
            assert.equal(judgesMapProduct(recipeType(type), product), false)
        })
    }
})

describe('declaring analysis prerequisites', () => {
    it('refuses an operation naming a role they need, which would weaken or repeat them', () => {
        assert.throws(() => typeDeclaring({
            executionNeeds: {PIXEL_SEGMENTS: {CLASSIFICATION_SOURCE: 'REFERENCE'}},
            analysisPrerequisites: {needs: {CLASSIFICATION_SOURCE: 'CLASSIFIER'}}
        }), /PIXEL_SEGMENTS of CLASSIFICATION_SOURCE/)
    })

    it('refuses a requirement scoped to operations, which they apply to all', () => {
        assert.throws(() => typeDeclaring({
            analysisPrerequisites: {requirements: [{code: 'C', operations: ['IMAGE_OUTPUT'], findings: () => []}]}
        }), /analysis prerequisites/)
    })

    it('accepts needs by role and requirements of every operation', () => {
        const definition = typeDeclaring({
            executionNeeds: {PIXEL_SEGMENTS: {SOURCE_IMAGERY: 'REFERENCE'}},
            analysisPrerequisites: {needs: {CLASSIFICATION_SOURCE: 'CLASSIFIER'}, requirements: [{code: 'C', findings: () => []}]}
        })

        assert.deepEqual(definition.analysisPrerequisites.needs, {CLASSIFICATION_SOURCE: 'CLASSIFIER'})
    })
})

const CCDC = 'ccdc-1'
const CLASSIFICATION = 'classification-1'
const INPUT_ASSET = 'users/x/input'

const ccdc = () => ({
    id: CCDC,
    type: 'CCDC',
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['nbr']},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 0}
    }
})

const classification = () => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: INPUT_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend: {entries: [{value: 1}, {value: 2}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]}
    }
})

const graph = () => {
    const records = [ccdc(), classification()]
    return buildRecipeDependencyGraph({rootRecipe: records[0], recipesById: new Map(records.map(record => [record.id, record]))})
}

const observed = names => ({bands: names.map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []})

const declarationFor = ({type}) => recipeType(type)?.imageOutput

const readinessFor = ({type}) => recipeType(type)

const typeDeclaring = declarations =>
    defineRecipeType({type: 'DECLARING', directSources: () => [], imageOutput: NO_IMAGE_OUTPUT, ...declarations})
