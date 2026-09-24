import {beforeEach, describe, expect, it, vi} from 'vitest'

// Retrieving CCDC: a selection of measures, checked against CCDC's described output by the bands CCDC's own rule
// exports for it - the measures chosen and the configured breakpoint bands, each with every band it produces - and
// submitted to CCDC's own export as the measures chosen, with every template CCDC offers attached for that export to
// keep by the bands it derives. The declaration, the common read, the decision and CCDC's submitter are the real
// ones; the terminal the panel's acquisition would retain is built from the catalogue the declaration describes.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({getTaskInfo: () => ({})}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: () => ({getDateRange: () => [], getPreSetVisualizations: () => []})
}))

const submitted = vi.hoisted(() => [])
vi.mock('~/apiRegistry', () => ({
    default: {
        tasks: {
            submit$: task => {
                submitted.push(task)
                return {subscribe: () => {}}
            }
        }
    }
}))

const {ccdcMeasures, ccdcOutputBands, ccdcPhysicalBands} = await import('#sepal/recipe/type/ccdc')
const {buildRecipeDependencyGraph} = await import('#sepal/recipe/source/dependencyGraph')
const {readRecipeOutput} = await import('../recipeOutput')
const {retrieveDecision, submitRetrieve} = await import('../retrieveOutput')
const {getAllVisualizations, submitRetrieveTask} = await import('./ccdcRecipe')
const {ccdcMeasureSelection} = await import('./retrieveSelection')

beforeEach(() => {
    submitted.length = 0
})

describe('the measures CCDC offers for retrieval', () => {
    it('are those its described output holds', () => {
        const {output} = readOf(ccdcBreakingOn(['ndvi']))

        expect(ccdcMeasureSelection.choices(output)).toEqual(ccdcMeasures({model: ccdcBreakingOn(['ndvi']).model}))
    })
})

describe('retrieving a measure CCDC does not break on', () => {
    const ccdc = ccdcBreakingOn(['ndvi'])

    it('exports the breakpoint measure beside it, as CCDC fits them', () => {
        const {names} = request(ccdc, ['red'])

        expect(names).toEqual(expect.arrayContaining(['red_coefs', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude', 'tStart']))
    })

    it('asks CCDC for the measure chosen, not the bands it exports', () => {
        retrieve(ccdc, ['red'])

        expect(submitted.map(({operation, params}) => [operation, params.image.bands])).toEqual([['ccdc.GEE', ['red']]])
    })

    // The export keeps a template by the bands it derives - `red`, `red_intercept`, `red_phase_1` - which no filter
    // over the stored `red_coefs` could decide, so every template CCDC offers travels with it.
    it('attaches every template CCDC offers, for its export to keep by the bands it derives', () => {
        retrieve(ccdc, ['red'])

        expect(submitted[0].params.image.visualizations).toEqual(getAllVisualizations(ccdc))
    })
})

describe('a breakpoint band the collection no longer carries', () => {
    // Thermal is carried by Landsat and not by Sentinel-2.
    const ccdc = ccdcBreakingOn(['thermal'], {SENTINEL_2: ['SENTINEL_2']})

    it('is named as unavailable, though it was never chosen', () => {
        const {output} = readOf(ccdc)
        const {names} = request(ccdc, ['red'])
        const decision = retrieveDecision({recipe: ccdc, output, pending: false, names, destination: 'GEE'})

        expect(ccdcMeasureSelection.unavailable(decision.missingBandNames)).toEqual(['thermal'])
    })

    it('blocks retrieval of the measures that are available', () => {
        retrieve(ccdc, ['red'])

        expect(submitted).toEqual([])
    })
})

const ccdcBreakingOn = (breakpointBands, dataSets = {LANDSAT: ['LANDSAT_8']}) => ({
    id: 'ccdc-1',
    type: 'CCDC',
    title: 'Segments',
    model: {
        dates: {startDate: '2000-01-01', endDate: '2020-01-01'},
        sources: {dataSets, breakpointBands},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1}
    }
})

// CCDC's read once its catalogue is observed: the bands its declaration says its fittable measures produce.
const readOf = ccdc => {
    const terminal = {
        status: 'READY',
        description: {
            executionReference: {type: 'RECIPE_REF', id: ccdc.id},
            output: {kind: 'IMAGE', bands: ccdcPhysicalBands(ccdcOutputBands(ccdcMeasures({model: ccdc.model})))},
            evidence: []
        },
        diagnostics: [],
        error: null,
        dependencyValidity: {status: 'VALID', diagnostics: []}
    }
    const graph = buildRecipeDependencyGraph({rootRecipe: ccdc, recipesById: new Map([[ccdc.id, ccdc]])})
    return {
        recipe: ccdc,
        output: readRecipeOutput({recipe: ccdc, product: {name: 'IMAGE_OUTPUT'}, graph, heldFor: () => terminal}),
        pending: false
    }
}

const options = measures => ({destination: 'GEE', assetId: 'users/x/segments', scale: 30, bands: measures})

const request = (ccdc, measures) =>
    ccdcMeasureSelection.request({recipe: ccdc, retrieveOptions: options(measures)})

const retrieve = (ccdc, measures) =>
    submitRetrieve({...readOf(ccdc), request: request(ccdc, measures), submitTask: submitRetrieveTask})
