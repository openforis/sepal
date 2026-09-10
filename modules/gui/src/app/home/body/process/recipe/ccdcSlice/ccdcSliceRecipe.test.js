import moment from 'moment'
import {describe, expect, it, vi} from 'vitest'

// What a CCDC Slice retrieval submits. The panel's selection is base bands and measures; what leaves for
// Earth Engine is the band names the operation produces from them - and the shared submitter needs those
// names, not only the customized image, because it decides which visualizations travel with the export.

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

const {availableBandsOf, materializedTemplates} = await import('./sliceEvidence')
const {submitRetrieveRecipeTask} = await import('./ccdcSliceRecipe')

registry.CCDC_SLICE = {
    getDateRange: recipe => {
        const date = moment.utc(recipe.model.date.date, 'YYYY-MM-DD')
        return [date, date]
    },
    getAvailableBands: (recipe, evidence) => availableBandsOf(recipe, evidence?.segments),
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

const submit = recipe => {
    submitted.length = 0
    submitRetrieveRecipeTask(recipe)
    return submitted[0].params.image
}

describe('submitting a slice retrieval', () => {
    const selectingNdviValueAndStart = sliceRetrieving({
        baseBands: ['ndvi'],
        bandTypes: ['value'],
        segmentBands: ['tStart']
    })

    it('exports the band names the selection resolves to', () => {
        expect(submit(selectingNdviValueAndStart).bands).toEqual({
            selection: ['ndvi', 'tStart'],
            baseBands: ['ndvi']
        })
    })

    it('carries the templates over exported bands', () => {
        expect(submit(selectingNdviValueAndStart).visualizations.map(({id}) => id)).toEqual(['t-ndvi'])
    })

    it('leaves behind a template naming a band the export does not include', () => {
        expect(submit(selectingNdviValueAndStart).visualizations.map(({id}) => id)).not.toContain('t-rmse')
    })
})
