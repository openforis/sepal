import {describe, expect, it, vi} from 'vitest'

// What Masking's consumers answer once the source has been observed. The layer form, the generic
// reconciler, Retrieve's band options and the exported visualization filter all read the same two helpers,
// so this is where "Preview, input choices and Retrieve agree" is decided.
//
// `getAllVisualizations` reaches the recipe type through the registry, which only the running application
// populates. It is mocked to Masking's own helpers - the entry masking.jsx registers - so the reconciler's
// view is exercised without mounting the app.

vi.mock('../../recipeTypeRegistry', async () => {
    const {getAvailableBands} = await import('./bands')
    const {getPreSetVisualizations} = await import('./visualizations')
    return {getRecipeType: () => ({getAvailableBands, getPreSetVisualizations})}
})

const {getAvailableBands} = await import('./bands')
const {getPreSetVisualizations} = await import('./visualizations')
const {getAllVisualizations} = await import('../visualizations')

const NDVI = {id: 'v-ndvi', bands: ['ndvi'], type: 'continuous'}
const RED = {id: 'v-red', bands: ['red'], type: 'continuous'}
const LOCAL_NDVI = {id: 'local-1', bands: ['ndvi'], type: 'continuous', palette: ['#000', '#fff']}

const scalar = names => names.map(name => ({name, dataType: {arrayDimensions: 0}}))

// A recipe saved when its source still had `ndvi`, whose source has since dropped it.
const maskingRecipe = ({sourceEvidence, userDefined = []} = {}) => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {
        imageToMask: {
            type: 'RECIPE_REF',
            id: 'source-1',
            bands: ['red', 'nir', 'ndvi'],
            visualizations: [NDVI, RED]
        }
    },
    layers: {userDefinedVisualizations: {'this-recipe': userDefined}},
    ...(sourceEvidence ? {ui: {sourceEvidence}} : {})
})

const observed = ({bands, visualizations}) => ({
    sourceKey: 'RECIPE_REF:source-1',
    status: 'OBSERVED',
    bands,
    visualizations
})

const dropped = observed({bands: scalar(['red', 'nir']), visualizations: [RED]})

describe('a source that has dropped a band since the recipe was saved', () => {
    const recipe = maskingRecipe({sourceEvidence: dropped})

    it('no longer offers the removed band', () => {
        expect(Object.keys(getAvailableBands(recipe))).toEqual(['red', 'nir'])
    })

    it('no longer offers the preset that named it', () => {
        expect(getPreSetVisualizations(recipe)).toEqual([RED])
    })

    it('keeps offering the removed band while nothing has been observed', () => {
        expect(Object.keys(getAvailableBands(maskingRecipe()))).toEqual(['red', 'nir', 'ndvi'])
    })

    it('offers nothing at all once the source is known to be unavailable', () => {
        const unavailable = maskingRecipe({
            sourceEvidence: {sourceKey: 'RECIPE_REF:source-1', status: 'UNAVAILABLE', bands: [], visualizations: []}
        })

        expect(getAvailableBands(unavailable)).toEqual({})
    })
})

// A style the user made is theirs. It stops being offered while its band is missing - the map cannot draw
// it - but it is not rewritten, and nothing deletes it from the recipe, so restoring the band restores it.
describe('a local style naming a band the source has dropped', () => {
    const recipe = maskingRecipe({sourceEvidence: dropped, userDefined: [LOCAL_NDVI]})

    it('is not offered as a candidate', () => {
        expect(getAllVisualizations(recipe).map(({id}) => id)).toEqual(['v-red'])
    })

    it('is still saved on the recipe, unchanged', () => {
        expect(recipe.layers.userDefinedVisualizations['this-recipe']).toEqual([LOCAL_NDVI])
    })

    it('becomes a candidate again when the source has the band again', () => {
        const restored = maskingRecipe({
            sourceEvidence: observed({bands: scalar(['red', 'nir', 'ndvi']), visualizations: [NDVI, RED]}),
            userDefined: [LOCAL_NDVI]
        })

        expect(getAllVisualizations(restored).map(({id}) => id)).toEqual(['local-1', 'v-ndvi', 'v-red'])
    })
})

// Every band a CCDC Segments image carries is an array over its segments, so none of them is a surface a
// direct renderer can draw - not the harmonics Slice derives, and not the residuals that are physically
// present. The templates stay on the recipe as evidence for that transformation; what changes is that none
// of them is offered here as a style this image can wear.
describe('a masked CCDC Segments asset', () => {
    const HARMONIC = {id: 'v-harmonic', bands: ['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse']}
    const RMSE = {id: 'v-rmse', bands: ['ndvi_rmse']}
    const SEGMENT_BANDS = ['tStart', 'tEnd', 'ndvi_coefs', 'ndvi_rmse']

    const maskedSegments = bands => ({
        id: 'masked-1',
        type: 'MASKING',
        model: {
            imageToMask: {
                type: 'ASSET',
                id: 'users/bob/segments',
                bands: SEGMENT_BANDS,
                visualizations: [HARMONIC, RMSE]
            }
        },
        layers: {userDefinedVisualizations: {}},
        ui: {
            sourceEvidence: {
                sourceKey: 'ASSET:users/bob/segments',
                status: 'OBSERVED',
                bands,
                visualizations: [HARMONIC, RMSE]
            }
        }
    })

    const asArrays = SEGMENT_BANDS.map(name => ({name, dataType: {arrayDimensions: 1}}))

    it('offers no direct visualization, because every band is an array', () => {
        expect(getAllVisualizations(maskedSegments(asArrays))).toEqual([])
    })

    it('does not offer the residual band merely because its name is present', () => {
        expect(getAllVisualizations(maskedSegments(asArrays)).map(({id}) => id)).not.toContain('v-rmse')
    })

    it('still reports both templates as the source\u2019s presets, which is what they are', () => {
        expect(getPreSetVisualizations(maskedSegments(asArrays)).map(({id}) => id))
            .toEqual(['v-harmonic', 'v-rmse'])
    })

    it('keeps every template on the recipe rather than deleting it', () => {
        expect(maskedSegments(asArrays).model.imageToMask.visualizations).toEqual([HARMONIC, RMSE])
    })

    // A style the user saved over an array band is no more drawable than an inherited one. It is withheld
    // from the choices and left untouched in the recipe.
    it('withholds a local style over an array band as well', () => {
        const recipe = maskedSegments(asArrays)
        const local = {id: 'local-rmse', bands: ['ndvi_rmse'], type: 'continuous'}
        recipe.layers.userDefinedVisualizations = {'this-recipe': [local]}

        expect(getAllVisualizations(recipe)).toEqual([])
        expect(recipe.layers.userDefinedVisualizations['this-recipe']).toEqual([local])
    })

    it('offers a local style over a scalar band', () => {
        const recipe = maskedSegments([
            ...asArrays,
            {name: 'changeProb', dataType: {arrayDimensions: 0}}
        ])
        recipe.layers.userDefinedVisualizations = {
            'this-recipe': [{id: 'local-change', bands: ['changeProb'], type: 'continuous'}]
        }

        expect(getAllVisualizations(recipe).map(({id}) => id)).toEqual(['local-change'])
    })

    it('keeps the array bands exportable', () => {
        expect(Object.keys(getAvailableBands(maskedSegments(asArrays)))).toEqual(SEGMENT_BANDS)
    })
})
