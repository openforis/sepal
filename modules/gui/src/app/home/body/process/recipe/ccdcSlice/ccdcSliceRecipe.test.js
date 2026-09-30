import moment from 'moment'
import {describe, expect, it, vi} from 'vitest'

// What a CCDC Slice retrieval submits, from the selection the panel holds to the task that leaves: the selection is
// base bands and measures; what leaves for Earth Engine is the band names they ask for, checked against the slice's
// read of its own output, under Earth Engine's default policy for each verified scalar band, with the templates that
// survive over exactly those bands. The slice's declaration, the common read, the decision and the generic
// submitter are the real ones; the terminal a Retrieve panel's acquisition would retain is supplied.

vi.mock('~/app/home/body/process/recipe', () => ({recipeActionBuilder: () => () => ({})}))
vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))

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

// Filled in below rather than inside the factory: the slice's own answers are the real ones, and the
// modules holding them import the registry themselves.
const registry = vi.hoisted(() => ({}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: type => registry[type]}))

vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))

const {sliceOutputBands} = await import('#sepal/recipe/type/ccdcSlice')
const {buildRecipeDependencyGraph} = await import('#sepal/recipe/source/dependencyGraph')
const {materializedTemplates, sliceRequest} = await import('./sliceEvidence')
const {retrieveTask} = await import('./ccdcSliceRecipe')
const {readRecipeOutput} = await import('../recipeOutput')
const {submitRetrieve} = await import('../retrieveOutput')

registry.CCDC_SLICE = {
    getDateRange: recipe => {
        const date = moment.utc(recipe.model.date.date, 'YYYY-MM-DD')
        return [date, date]
    },
    getPreSetVisualizations: (recipe, evidence) => materializedTemplates(recipe, evidence?.segments)
}

const NDVI = {id: 't-ndvi', bands: ['ndvi'], type: 'continuous', palette: ['#000', '#fff']}
const NDVI_RMSE = {id: 't-rmse', bands: ['ndvi_rmse'], type: 'continuous', palette: ['#000', '#fff']}

const sliceRetrieving = retrieveOptions => ({
    id: 'slice-1',
    type: 'CCDC_SLICE',
    placeholder: 'Slice',
    projectId: null,
    model: {
        source: {type: 'RECIPE_REF', id: 'ccdc-1'},
        date: {dateType: 'SINGLE', date: '2020-06-01'},
        options: {gapStrategy: 'MASK', harmonics: 3}
    },
    ui: {
        initialized: true,
        sourceEvidence: {
            sourceKey: 'RECIPE_REF:ccdc-1',
            status: 'OBSERVED',
            observation: 1,
            segments: {
                bands: ['ndvi_coefs', 'ndvi_rmse', 'tStart'],
                baseBands: [{name: 'ndvi', measures: ['value', 'rmse']}],
                segmentBands: [{name: 'tStart'}],
                visualizations: [NDVI, NDVI_RMSE]
            }
        },
        retrieveOptions: {
            destination: 'GEE',
            assetType: 'Image',
            assetId: 'users/x/sliced',
            scale: 30,
            ...retrieveOptions
        }
    }
})

// The slice's output as its read answers it once the source's segments are observed: what the slice's own
// derivation makes of them, each band scalar.
const readOf = recipe => {
    const terminal = {
        status: 'READY',
        description: {
            executionReference: {type: 'RECIPE_REF', id: recipe.id},
            output: {
                kind: 'IMAGE',
                bands: sliceOutputBands(recipe.ui.sourceEvidence.segments.bands, recipe.model)
                    .map(name => ({name, dataType: {arrayDimensions: 0}}))
            },
            evidence: []
        },
        diagnostics: [],
        error: null,
        dependencyValidity: {status: 'VALID', diagnostics: []}
    }
    const graph = buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])})
    return {
        recipe,
        output: readRecipeOutput({recipe, product: {name: 'IMAGE_OUTPUT'}, graph, heldFor: () => terminal}),
        pending: false
    }
}

const submit = recipe => {
    submitted.length = 0
    const submittedOptions = recipe.ui.retrieveOptions
    const read = readOf(recipe)
    submitRetrieve({...read, request: sliceRequest({output: read.output, retrieveOptions: submittedOptions}), task: retrieveTask})
    return submitted[0]?.params.image
}

describe('submitting a slice retrieval', () => {
    const selectingNdviValueAndStart = sliceRetrieving({
        baseBands: ['ndvi'],
        bandTypes: ['value'],
        segmentBands: ['tStart']
    })

    it('exports the band names the selection resolves to', () => {
        expect(submit(selectingNdviValueAndStart).bands).toEqual({selection: ['ndvi', 'tStart']})
    })

    it('exports them in the order the slice holds them, whatever order they were chosen in', () => {
        const selectingRmseFirst = sliceRetrieving({
            baseBands: ['ndvi'],
            bandTypes: ['rmse', 'value'],
            segmentBands: ['tStart']
        })

        expect(submit(selectingRmseFirst).bands).toEqual({selection: ['ndvi', 'ndvi_rmse', 'tStart']})
    })

    it('gives each band Earth Engine\'s default policy, the slice declaring none', () => {
        expect(submit(selectingNdviValueAndStart).pyramidingPolicy).toEqual({ndvi: 'mean', tStart: 'mean'})
    })

    it('carries the templates over exported bands', () => {
        expect(submit(selectingNdviValueAndStart).visualizations.map(({id}) => id)).toEqual(['t-ndvi'])
    })

    it('leaves behind a template naming a band the export does not include', () => {
        expect(submit(selectingNdviValueAndStart).visualizations.map(({id}) => id)).not.toContain('t-rmse')
    })

    it('submits nothing for a combination the slice does not produce, rather than the rest of the selection', () => {
        expect(submit(sliceRetrieving({baseBands: ['ndvi', 'nbr'], bandTypes: ['value'], segmentBands: []})))
            .toBeUndefined()
    })

    it('submits nothing for a measure it does not recognize, rather than reading it as another', () => {
        expect(submit(sliceRetrieving({baseBands: ['ndvi'], bandTypes: ['value', 'coefs'], segmentBands: []})))
            .toBeUndefined()
    })
})
