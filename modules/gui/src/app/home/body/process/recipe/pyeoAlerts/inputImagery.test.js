import {firstValueFrom, of, throwError} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

// What PyEO Alerts can learn about the imagery a classification was trained on: the bands its index gate is
// limited to, and the collection configuration its own panels can be filled from.
//
// The two are independent. Opening a saved recipe asks for bands alone; only a user's selection asks for
// defaults, and a source that cannot supply them is one the user configures by hand - it still supplies
// bands and still classifies.
//
// Real discovery and real declarations throughout; the recipe and asset reads are the substitutes.

vi.mock('~/translate', () => ({msg: key => key}))
// The window a producer covers is its own registered answer, stood in for here: what this proves is that
// the reader asks the producer and carries what it said, not how an optical mosaic computes its season.
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: type => type === 'MOSAIC'
        ? {getDateRange: ({model: {dates}}) => [dates.seasonStart, dates.seasonEnd]}
        : undefined
}))

const {NOT_DERIVABLE, readInputImagery$, SELECTED_SCENES} = await import('./inputImagery')

const MOSAIC = 'mosaic-1'
const MASKED = 'masked-mosaic'
const ASSET_MOSAIC = 'asset-mosaic-1'
const WRAPPED_ASSET = 'masked-asset-mosaic'
const MASKED_ASSET = 'masked-asset'
const RADAR = 'radar-1'
const MOSAIC_ASSET = 'users/x/mosaic'
const OPTICAL_BANDS = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']

describe('the imagery a classification was trained on', () => {
    it('is a directly selected optical mosaic, which states its own configuration', async () => {
        const {bands, defaults, restriction} = await read(recipeSelection(MOSAIC))

        expect(bands).toEqual(expect.arrayContaining(OPTICAL_BANDS))
        expect(defaults.sources.dataSets).toEqual({LANDSAT: ['LANDSAT_8']})
        expect(defaults.options).toEqual({corrections: ['SR']})
        expect(toDates(defaults)).toEqual(['2018-01-01', '2019-01-01'])
        expect(restriction).toBe(null)
    })

    it('is the mosaic under a preserving wrapper', async () => {
        const {bands, defaults} = await read(recipeSelection(MASKED))

        expect(bands).toEqual(expect.arrayContaining(OPTICAL_BANDS))
        expect(defaults.sources.dataSets).toEqual({LANDSAT: ['LANDSAT_8']})
    })

    it('is the asset a wrapper leads to, read once for both bands and configuration', async () => {
        const {bands, defaults} = await read(recipeSelection(WRAPPED_ASSET))

        expect(bands).toEqual(['B1', 'B2'])
        expect(defaults.sources.dataSets).toEqual({SENTINEL_2: ['SENTINEL_2']})
        expect(toDates(defaults)).toEqual(['2020-01-01', '2021-01-01'])
        expect(assetMetadata$).toHaveBeenCalledTimes(1)
    })

    // A wrapper straight over an asset ends the walk at the asset itself, not at a recipe that names one.
    it('is an asset a wrapper masks directly', async () => {
        const {bands, defaults} = await read(recipeSelection(MASKED_ASSET))

        expect(bands).toEqual(['B1', 'B2'])
        expect(defaults.sources.dataSets).toEqual({SENTINEL_2: ['SENTINEL_2']})
    })

    it('reads the bands of an asset a wrapper masks directly, without its configuration', async () => {
        const {bands, defaults} = await read(recipeSelection(MASKED_ASSET), {defaults: false})

        expect(bands).toEqual(['B1', 'B2'])
        expect(defaults).toBe(null)
    })

    it('is a directly selected asset', async () => {
        const {bands, defaults} = await read({type: 'ASSET', id: MOSAIC_ASSET})

        expect(bands).toEqual(['B1', 'B2'])
        expect(defaults.sources.dataSets).toEqual({SENTINEL_2: ['SENTINEL_2']})
    })
})

describe('asking for bands alone, as opening a saved recipe does', () => {
    it('reads no configuration from a recipe and proposes none', async () => {
        const {bands, defaults, restriction} = await read(recipeSelection(MOSAIC), {defaults: false})

        expect(bands).toEqual(expect.arrayContaining(OPTICAL_BANDS))
        expect(defaults).toBe(null)
        expect(restriction).toBe(null)
    })

    // Hand-picked scenes rule out deriving a monitoring window, which is not a reason to withhold the
    // bands of a recipe the user has already committed to.
    it('reads the bands of a source whose configuration could not be derived', async () => {
        recipes[MOSAIC].model.sceneSelectionOptions = {type: 'SELECT'}

        const {bands, restriction} = await read(recipeSelection(MOSAIC), {defaults: false})

        expect(bands).toEqual(expect.arrayContaining(OPTICAL_BANDS))
        expect(restriction).toBe(null)
    })
})

describe('imagery no configuration can be derived from', () => {
    it('reports hand-picked scenes, leaving the bands it did read', async () => {
        recipes[MOSAIC].model.sceneSelectionOptions = {type: 'SELECT'}

        const {bands, defaults, restriction} = await read(recipeSelection(MOSAIC))

        expect(bands).toEqual(expect.arrayContaining(OPTICAL_BANDS))
        expect(defaults).toBe(null)
        expect(restriction).toBe(SELECTED_SCENES)
    })

    // Its bands were read from the same response that failed to yield a configuration.
    it('keeps the bands of an asset whose exported configuration is malformed', async () => {
        assetMetadata$.mockReturnValue(of({
            bandNames: ['B1', 'B2'],
            properties: {recipe_sources: '{not json', recipe_options: '{}', 'system:time_start': 0, 'system:time_end': 1}
        }))

        const {bands, defaults, restriction} = await read({type: 'ASSET', id: MOSAIC_ASSET})

        expect(bands).toEqual(['B1', 'B2'])
        expect(defaults).toBe(null)
        expect(restriction).toBe(NOT_DERIVABLE)
    })

    it('keeps the bands of an asset that was exported without one', async () => {
        assetMetadata$.mockReturnValue(of({bandNames: ['B1', 'B2'], properties: {}}))

        const {bands, restriction} = await read({type: 'ASSET', id: MOSAIC_ASSET})

        expect(bands).toEqual(['B1', 'B2'])
        expect(restriction).toBe(NOT_DERIVABLE)
    })

    // A radar mosaic declares no optical collection. What it answers about its bands is what it always
    // answered; only the automatic prefill declines.
    it('declines for a producer that declares no optical collection, answering about bands as before', async () => {
        const {bands, defaults, restriction} = await read(recipeSelection(RADAR))

        expect(bands).toEqual([])
        expect(defaults).toBe(null)
        expect(restriction).toBe(NOT_DERIVABLE)
    })
})

describe('imagery that cannot be resolved at all', () => {
    it('fails when the selected record cannot be read', async () => {
        await expect(read(recipeSelection('deleted-1'))).rejects.toThrow()
    })

    it('fails when the wrappers close on themselves', async () => {
        recipes[MASKED].model.imageToMask = recipeSelection(MASKED)

        await expect(read(recipeSelection(MASKED))).rejects.toThrow()
    })

})

const toDates = ({start, end}) => [start, end].map(value =>
    typeof value === 'number' ? new Date(value).toISOString().slice(0, 10) : value)

const recipeSelection = id => ({type: 'RECIPE_REF', id})

let recipes, loadRecipe$, assetMetadata$

beforeEach(() => {
    recipes = {
        [MOSAIC]: {
            id: MOSAIC,
            type: 'MOSAIC',
            model: {
                aoi: {},
                sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 40},
                compositeOptions: {corrections: ['SR']},
                dates: {seasonStart: '2018-01-01', seasonEnd: '2019-01-01', yearsBefore: 0, yearsAfter: 0}
            }
        },
        [MASKED]: {id: MASKED, type: 'MASKING', model: {imageToMask: recipeSelection(MOSAIC)}},
        [WRAPPED_ASSET]: {id: WRAPPED_ASSET, type: 'MASKING', model: {imageToMask: recipeSelection(ASSET_MOSAIC)}},
        [MASKED_ASSET]: {
            id: MASKED_ASSET,
            type: 'MASKING',
            model: {imageToMask: {type: 'ASSET', id: MOSAIC_ASSET}}
        },
        [ASSET_MOSAIC]: {id: ASSET_MOSAIC, type: 'ASSET_MOSAIC', model: {assetDetails: {assetId: MOSAIC_ASSET}}},
        [RADAR]: {
            id: RADAR,
            type: 'RADAR_MOSAIC',
            model: {aoi: {}, sources: {dataSets: {SENTINEL_1: ['SENTINEL_1']}}, dates: {}}
        }
    }
    loadRecipe$ = vi.fn(id => recipes[id]
        ? of(recipes[id])
        : throwError(() => new Error(`No such recipe: ${id}`)))
    assetMetadata$ = vi.fn(() => of({
        bandNames: ['B1', 'B2'],
        properties: {
            recipe_sources: JSON.stringify({dataSets: {SENTINEL_2: ['SENTINEL_2']}}),
            recipe_compositeOptions: JSON.stringify({corrections: ['SR']}),
            'system:time_start': Date.UTC(2020, 0, 1),
            'system:time_end': Date.UTC(2021, 0, 1)
        }
    }))
})

const read = (reference, {defaults = true} = {}) => firstValueFrom(
    readInputImagery$(reference, {loadRecipe$, loadedRecipes: {}, assetMetadata$}, {defaults})
)
