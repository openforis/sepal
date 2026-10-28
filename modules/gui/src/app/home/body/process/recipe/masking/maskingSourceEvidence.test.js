import {describe, expect, it, vi} from 'vitest'

// The presets Masking offers from the evidence it holds about its source, filtered against the bands its description
// holds, as a consumer holding that description would filter them.
//
// `recipeVisualizations` reaches the presets through the registry, which only the running application populates.
// It is mocked to Masking's own entry, so the filter's view is exercised without mounting the app.

vi.mock('../../recipeTypeRegistry', async () => {
    const {getPreSetVisualizations} = await import('./visualizations')
    return {getRecipeType: () => ({getPreSetVisualizations})}
})

const {getPreSetVisualizations} = await import('./visualizations')
const {recipeVisualizations} = await import('../visualizations')

// What a consumer offers, given the bands Masking's description holds.
const offered = (recipe, bands) =>
    recipeVisualizations(recipe, Object.fromEntries(bands.map(({name, dataType}) => [name, {dataType}])))

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

const observed = visualizations => ({
    sourceKey: 'RECIPE_REF:source-1',
    status: 'OBSERVED',
    visualizations
})

// The source's presets once it dropped the band, and the bands Masking's description then holds.
const dropped = observed([RED])
const droppedBands = scalar(['red', 'nir'])

describe('a source that has dropped a band since the recipe was saved', () => {
    it('no longer offers the preset that named it', () => {
        expect(getPreSetVisualizations(maskingRecipe({sourceEvidence: dropped}))).toEqual([RED])
    })

    it('offers no preset once the source is known to be unavailable', () => {
        const unavailable = maskingRecipe({
            sourceEvidence: {sourceKey: 'RECIPE_REF:source-1', status: 'UNAVAILABLE', visualizations: []}
        })

        expect(getPreSetVisualizations(unavailable)).toEqual([])
    })
})

// A style the user made is theirs. It stops being offered while its band is missing - the map cannot draw
// it - but it is not rewritten, and nothing deletes it from the recipe, so restoring the band restores it.
describe('a local style naming a band the source has dropped', () => {
    const recipe = maskingRecipe({sourceEvidence: dropped, userDefined: [LOCAL_NDVI]})

    it('is not offered as a candidate', () => {
        expect(offered(recipe, droppedBands).map(({id}) => id)).toEqual(['v-red'])
    })

    it('is still saved on the recipe, unchanged', () => {
        expect(recipe.layers.userDefinedVisualizations['this-recipe']).toEqual([LOCAL_NDVI])
    })

    it('becomes a candidate again when the source has the band again', () => {
        const bands = scalar(['red', 'nir', 'ndvi'])
        const restored = maskingRecipe({
            sourceEvidence: observed([NDVI, RED]),
            userDefined: [LOCAL_NDVI]
        })

        expect(offered(restored, bands).map(({id}) => id)).toEqual(['local-1', 'v-ndvi', 'v-red'])
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

    const maskedSegments = () => ({
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
                visualizations: [HARMONIC, RMSE]
            }
        }
    })

    const asArrays = SEGMENT_BANDS.map(name => ({name, dataType: {arrayDimensions: 1}}))

    it('offers no direct visualization, because every band is an array', () => {
        expect(offered(maskedSegments(), asArrays)).toEqual([])
    })

    it('does not offer the residual band merely because its name is present', () => {
        expect(offered(maskedSegments(), asArrays).map(({id}) => id)).not.toContain('v-rmse')
    })

    it('still reports both templates as the source\u2019s presets, which is what they are', () => {
        expect(getPreSetVisualizations(maskedSegments()).map(({id}) => id))
            .toEqual(['v-harmonic', 'v-rmse'])
    })

    it('keeps every template on the recipe rather than deleting it', () => {
        expect(maskedSegments().model.imageToMask.visualizations).toEqual([HARMONIC, RMSE])
    })

    // A style the user saved over an array band is no more drawable than an inherited one. It is withheld
    // from the choices and left untouched in the recipe.
    it('withholds a local style over an array band as well', () => {
        const recipe = maskedSegments()
        const local = {id: 'local-rmse', bands: ['ndvi_rmse'], type: 'continuous'}
        recipe.layers.userDefinedVisualizations = {'this-recipe': [local]}

        expect(offered(recipe, asArrays)).toEqual([])
        expect(recipe.layers.userDefinedVisualizations['this-recipe']).toEqual([local])
    })

    it('offers a local style over a scalar band', () => {
        const bands = [...asArrays, {name: 'changeProb', dataType: {arrayDimensions: 0}}]
        const recipe = maskedSegments()
        recipe.layers.userDefinedVisualizations = {
            'this-recipe': [{id: 'local-change', bands: ['changeProb'], type: 'continuous'}]
        }

        expect(offered(recipe, bands).map(({id}) => id)).toEqual(['local-change'])
    })
})
