import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {format} from 'node:util'

import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Whether a Regression can run, as its configuration says: every classifier it offers is trained, on the points its data
// sets store, or on those a RECIPE data set reads from another recipe when it runs - unknown here, and never taken for
// none. Without any it is described and cannot run, and neither can a recipe whose image builds it, though that recipe's
// description reads nothing of it. Whether training on what is stored succeeds is not said. Codes, statuses and persisted
// field names are literals.

describe('a Regression without training data', () => {
    for (const [_case, dataSetsOf] of [
        ['no data set', () => []],
        ['a table of field plots read as empty', () => [plotsTable([])]]
    ]) {
        it(format('with %s is described, and cannot run', _case), () => {
            const recipe = regression({dataSets: dataSetsOf()})

            const result = read(recipe, [COMPOSITE])

            assert.equal(result.status, 'READY')
            assert.deepEqual(result.description.output.bands.map(({name}) => name), ['regression'])
            assert.deepEqual(result.readiness, {
                status: 'NOT_READY',
                findings: [{code: 'NO_TRAINING_DATA', path: ['model', 'trainingData', 'dataSets'], recipePath: [REGRESSION]}],
                needs: {records: [], observations: []}
            })
        })
    }

    // Its execution trains whichever classifier is configured, a decision tree included.
    for (const classifier of ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART', 'DECISION_TREE']) {
        it(format('cannot run, its %s classifier trained like every other', classifier), () => {
            const recipe = regression({dataSets: [], classifier})

            assert.equal(read(recipe, [COMPOSITE]).readiness.status, 'NOT_READY')
        })
    }

    it('keeps a Remapping of its predictions from running, though the Remapping\'s description reads nothing of it', () => {
        const result = read(remapping(), [regression({dataSets: []}), COMPOSITE])

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.readiness.findings, [
            {code: 'NO_TRAINING_DATA', path: ['model', 'trainingData', 'dataSets'], recipePath: [REMAPPING, REGRESSION]}
        ])
    })
})

describe('a Regression with training data', () => {
    for (const [_case, dataSetsOf] of [
        ['field plots read from a table', () => [plotsTable(PLOTS)]],
        ['samples of a canopy height image', () => [canopySamples(PLOTS)]],
        ['samples beside a table read as empty', () => [plotsTable([]), canopySamples(PLOTS)]]
    ]) {
        it(format('stored as %s, can run as far as its configuration says', _case), () => {
            assert.equal(read(regression({dataSets: dataSetsOf()}), [COMPOSITE]).readiness.status, 'READY')
        })
    }

    it('read from another recipe when it runs, can run, though what it reads is not known here', () => {
        const recipe = regression({dataSets: [{dataSetId: 'd-3', name: 'Earlier model', type: 'RECIPE', recipe: TRAINED_ELSEWHERE.id}]})

        assert.equal(read(recipe, [COMPOSITE, TRAINED_ELSEWHERE]).readiness.status, 'READY')
    })

    it('lets a Remapping of its predictions run once points are added', () => {
        const result = read(remapping(), [regression({dataSets: [plotsTable(PLOTS)]}), COMPOSITE])

        assert.deepEqual(result.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
    })
})

const REGRESSION = 'regression-1'
const REMAPPING = 'remapping-1'

// A Landsat composite, described from its configuration.
const COMPOSITE = {
    id: 'composite-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}

// Above-ground biomass in tonnes per hectare, measured on field plots.
const PLOTS = [{x: 9.71, y: 4.05, value: 212.4}, {x: 9.72, y: 4.07, value: 87.9}, {x: 9.75, y: 4.02, value: 154.1}]

const plotsTable = referenceData => ({
    dataSetId: 'd-1', name: 'biomass_plots', type: 'EE_TABLE', eeTable: 'users/x/biomass_plots', valueColumn: 'agb', referenceData
})

const canopySamples = referenceData => ({
    dataSetId: 'd-2', name: 'canopy_height', type: 'SAMPLE_IMAGE', typeToSample: 'ASSET', assetToSample: 'users/x/canopy_height',
    valueBand: 'height', sampleCount: 1000, sampleScale: 30, referenceData
})

const regression = ({dataSets, classifier = 'RANDOM_FOREST', id = REGRESSION}) => ({
    id,
    type: 'REGRESSION',
    model: {
        inputImagery: {images: [{
            imageId: 'i-1', type: 'RECIPE_REF', id: COMPOSITE.id,
            bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir', 'swir1']}]
        }]},
        trainingData: {dataSets},
        auxiliaryImagery: [],
        classifier: {type: classifier, numberOfTrees: 25}
    }
})

const TRAINED_ELSEWHERE = regression({id: 'regression-0', dataSets: [plotsTable(PLOTS)]})

// High biomass, where the prediction exceeds 150 t/ha.
const remapping = () => ({
    id: REMAPPING,
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id: REGRESSION, includedBands: [{band: 'regression'}]}]},
        legend: {entries: [{value: 1, constraints: [{image: 'r-1', band: 'regression', operator: '>', value: 150}]}]}
    }
})

const read = (root, records) => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))}),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type)
})
