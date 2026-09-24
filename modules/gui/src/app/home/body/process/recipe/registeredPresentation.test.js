import {describe, expect, it, vi} from 'vitest'

import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Presentation as the declared types really register it, over the real registry, declarations and read. Presentation
// decorates the bands a description resolves and offers candidate styles; the resolved bands alone decide which
// exist and which styles apply.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))

const {addRecipeType} = await import('../recipeTypeRegistry')
const {default: opticalMosaic} = await import('./opticalMosaic/opticalMosaic')
const {default: asset} = await import('./asset/asset')
const {displayTypes, readRecipeOutput} = await import('./recipeOutput')
const {recipeVisualizations} = await import('./visualizations')
const {getAllVisualizations: ccdcTemplates} = await import('./ccdc/ccdcRecipe')

addRecipeType(opticalMosaic())
addRecipeType(asset())

// Landsat and Sentinel-2 configured, Landsat scenes alone selected: only Landsat contributes, so the mosaic holds
// the thermal band and the indexes built on it, which Sentinel-2 would not.
describe('an optical mosaic compositing only one of its configured data sets', () => {
    const mosaic = {
        id: 'mosaic-1',
        type: 'MOSAIC',
        model: {
            sources: {dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}, cloudPercentageThreshold: 100},
            compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'},
            sceneSelectionOptions: {type: 'SELECT'},
            scenes: {'area-1': [{id: 'scene-1', dataSet: 'LANDSAT_8'}]}
        }
    }
    const read = () => readRecipeOutput({recipe: mosaic, product: {name: 'IMAGE_OUTPUT'}, graph: graphOf(mosaic)})

    it('describes the bands that data set contributes', () => {
        expect(read().bands.map(({name}) => name)).toEqual(expect.arrayContaining(['thermal', 'ebbi']))
    })

    it('decorates each of them with its display precision', () => {
        expect(displayTypes(read()).thermal).toEqual(expect.objectContaining({precision: 'int'}))
    })

    it('offers the styles of the bands it holds, however its data sets are configured', () => {
        expect(recipeVisualizations(mosaic, read().availableBands).map(({bands}) => bands))
            .toContainEqual(['ebbi'])
    })
})

describe('the EBBI style of an optical mosaic', () => {
    const mosaicOf = dataSets => ({
        id: 'mosaic-1',
        type: 'MOSAIC',
        model: {
            sources: {dataSets, cloudPercentageThreshold: 100},
            compositeOptions: {corrections: [], compose: 'MEDOID'}
        }
    })
    const offered = mosaic => recipeVisualizations(
        mosaic,
        readRecipeOutput({recipe: mosaic, product: {name: 'IMAGE_OUTPUT'}, graph: graphOf(mosaic)}).availableBands
    ).map(({bands}) => bands)

    it('is offered over Landsat, which carries the thermal band it needs', () => {
        expect(offered(mosaicOf({LANDSAT: ['LANDSAT_8']}))).toContainEqual(['ebbi'])
    })

    it.each([
        ['Sentinel-2 alone', {SENTINEL_2: ['SENTINEL_2']}],
        ['Landsat and Sentinel-2 composited together', {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}]
    ])('is not offered over %s, which leaves no thermal band', (_case, dataSets) => {
        const styles = offered(mosaicOf(dataSets))

        expect(styles).not.toContainEqual(['ebbi'])
        expect(styles).toContainEqual(['kndvi'])
    })
})

// CCDC's templates are candidate styles for what Slice derives from its segments, so they follow the measures CCDC
// fits - which its declaration derives from the optical collection - rather than what a mosaic would show.
describe('the templates an optical CCDC offers', () => {
    const ccdc = {
        id: 'ccdc-1',
        type: 'CCDC',
        model: {
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']},
            options: {corrections: ['SR']}
        }
    }
    const templateBands = () => ccdcTemplates(ccdc).map(({baseBands}) => baseBands)

    it('include one for an index its collection supports', () => {
        expect(templateBands()).toContainEqual(['ebbi'])
    })

    it('include none for a date band it never fits', () => {
        expect(templateBands()).not.toContainEqual(['dayOfYear'])
    })
})

describe('an asset recipe', () => {
    const recipe = {
        id: 'asset-1',
        type: 'ASSET_MOSAIC',
        model: {
            assetDetails: {
                assetId: 'users/x/image',
                bands: [
                    {id: 'b1', data_type: {type: 'PixelType', precision: 'int', min: 0, max: 255}},
                    {id: 'removed', data_type: {type: 'PixelType', precision: 'int', min: 0, max: 255}}
                ]
            }
        }
    }
    const described = {
        status: 'READY',
        description: {
            executionReference: {type: 'RECIPE_REF', id: 'asset-1'},
            output: {kind: 'IMAGE', bands: [{name: 'b1', dataType: {arrayDimensions: 0}}, {name: 'added', dataType: {arrayDimensions: 0}}]},
            evidence: []
        },
        diagnostics: [],
        error: null,
        dependencyValidity: {status: 'VALID', diagnostics: []}
    }
    const read = () => readRecipeOutput({
        recipe,
        product: {name: 'IMAGE_OUTPUT'},
        graph: graphOf(recipe),
        heldFor: () => described
    })

    it('is described by what was observed, never by the band list saved when the asset was selected', () => {
        expect(read().bands.map(({name}) => name)).toEqual(['b1', 'added'])
    })

    it('decorates an observed band with the precision saved for it, by name', () => {
        expect(displayTypes(read())).toEqual({b1: {precision: 'int', min: 0, max: 255}, added: undefined})
    })
})

const graphOf = recipe => buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])})
