import {AOI} from '#sepal/recipe/source/aoi'
import {directSourceEdges} from '#sepal/recipe/source/directSources'
import {PRIMARY_IMAGE as ASSET_MOSAIC_PRIMARY_IMAGE} from '#sepal/recipe/type/assetMosaic'
import {CLASSIFICATION_SOURCE, SOURCE_IMAGERY} from '#sepal/recipe/type/ccdc'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/ccdcSlice'
import {INPUT_IMAGE, TRAINING_DATA_SOURCE} from '#sepal/recipe/type/classification'

import {
    assetAoi,
    assetMosaicRecipe,
    ccdcPlanetRecipe,
    ccdcRecipe,
    ccdcSliceAssetSource,
    ccdcSliceRecipeSource,
    ccdcSliceWrappedAssetRecipeSource,
    classificationRecipe,
    COUNTRY_TABLE,
    polygonAoi,
    recipeAoi
} from './fixtures.js'

const recipeRef = id => ({type: 'RECIPE_REF', id})
const assetRef = id => ({type: 'ASSET', id})

const edges = recipe => directSourceEdges(recipe).edges.map(({reference, role}) => ({reference, role}))
const diagnostics = recipe => directSourceEdges(recipe).diagnostics
const referencedIds = recipe => directSourceEdges(recipe).edges.map(({reference: {id}}) => id)

describe('CCDC', () => {
    // The Classification source adds bands to the collection CCDC segments, and the AOI decides what is
    // clipped and filtered. Both change the pixels, so both are dependencies of the CCDC output.
    it('declares its optional Classification source and its AOI', () => {
        expect(edges(ccdcRecipe())).toEqual([
            {reference: assetRef(COUNTRY_TABLE), role: AOI},
            {reference: recipeRef('classification-1'), role: CLASSIFICATION_SOURCE}
        ])
    })

    it('omits the Classification edge when no classification is selected', () => {
        expect(edges(ccdcRecipe({classification: null}))).toEqual([
            {reference: assetRef(COUNTRY_TABLE), role: AOI}
        ])
    })

    // The AOI panel persists a recipe-backed AOI as type 'RECIPE', which is the same thing as a canonical
    // RECIPE_REF everywhere else. Leaving it unnormalized would hide a whole class of recipe dependency
    // from anything matching on the canonical type.
    it('normalizes a recipe-backed AOI to a canonical recipe reference', () => {
        expect(edges(ccdcRecipe({aoi: recipeAoi()}))).toContainEqual(
            {reference: recipeRef('aoi-recipe-1'), role: AOI}
        )
    })

    it('keeps an asset-backed AOI as a canonical asset reference', () => {
        expect(edges(ccdcRecipe({aoi: assetAoi()}))).toContainEqual(
            {reference: assetRef('projects/p/assets/aoi-image'), role: AOI}
        )
    })

    // A drawn polygon is geometry, not a source. Emitting an edge for it would invent a dependency with no
    // id to resolve.
    it('emits no AOI edge for a drawn polygon', () => {
        expect(edges(ccdcRecipe({aoi: polygonAoi()}))).toEqual([
            {reference: recipeRef('classification-1'), role: CLASSIFICATION_SOURCE}
        ])
    })

    // planet/collection.js merges these collections in order, so the order is part of the request.
    it('keeps Planet source assets in model order', () => {
        expect(edges(ccdcPlanetRecipe())).toEqual([
            {reference: assetRef('projects/p/assets/basemaps-a'), role: SOURCE_IMAGERY},
            {reference: assetRef('projects/p/assets/basemaps-b'), role: SOURCE_IMAGERY}
        ])
    })
})

describe('CCDC_SLICE', () => {
    // model.source is one selected reference wearing a copied description. imageFactory reads only its type
    // and id; every other field is evidence. Treating the snapshot as structure would multiply one
    // dependency into several.
    it('produces exactly one execution edge from a recipe-backed source snapshot', () => {
        expect(edges(ccdcSliceRecipeSource())).toEqual([
            {reference: recipeRef('ccdc-1'), role: PRIMARY_IMAGE}
        ])
    })

    it('produces exactly one execution edge from an asset-backed source snapshot', () => {
        expect(edges(ccdcSliceAssetSource())).toEqual([
            {reference: assetRef('projects/p/assets/ccdc-segments'), role: PRIMARY_IMAGE}
        ])
    })

    // sourceSync copies an asset-backed recipe's asset metadata into the snapshot and records what it
    // resolved to in `targetType`. The recipe the user selected is still what has to execute.
    it('references the selected recipe, not the asset its snapshot was copied from', () => {
        expect(edges(ccdcSliceWrappedAssetRecipeSource())).toEqual([
            {reference: recipeRef('asset-mosaic-1'), role: PRIMARY_IMAGE}
        ])
    })
})

describe('CLASSIFICATION', () => {
    // The input images are zipped into one image in model order, so position decides band order.
    it('declares input imagery in model order', () => {
        expect(edges(classificationRecipe())).toEqual([
            {reference: recipeRef('mosaic-1'), role: INPUT_IMAGE},
            {reference: assetRef('projects/p/assets/covariates'), role: INPUT_IMAGE},
            {reference: recipeRef('classification-0'), role: TRAINING_DATA_SOURCE}
        ])
    })

    it('keeps repeated input images ordered and distinct', () => {
        const recipe = classificationRecipe()
        const [first, second] = recipe.model.inputImagery.images
        recipe.model.inputImagery.images = [first, second, {...first, imageId: 'image-3'}]
        expect(referencedIds(recipe)).toEqual([
            'mosaic-1',
            'projects/p/assets/covariates',
            'mosaic-1',
            'classification-0'
        ])
    })

    // Only a RECIPE training data set is loaded at execution time (classification.js calls
    // getTrainingData$ on it). A SAMPLE_CLASSIFICATION set was sampled in the panel and persists its
    // points; its recipe and asset selections are provenance. Emitting them would pin recipes execution
    // never reads and warn about deleting them.
    it('declares only the training data set that is loaded at execution time', () => {
        const ids = referencedIds(classificationRecipe())
        expect(ids).toContain('classification-0')
        expect(ids).not.toContain('classification-9')
        expect(ids).not.toContain('projects/p/assets/sampled-classification')
        expect(ids).not.toContain('projects/p/assets/plots')
    })
})

describe('ASSET_MOSAIC', () => {
    it('declares the asset it mosaics', () => {
        expect(edges(assetMosaicRecipe())).toEqual([
            {reference: assetRef('projects/p/assets/mosaic'), role: ASSET_MOSAIC_PRIMARY_IMAGE}
        ])
    })

    it('declares an AOI that clips the asset', () => {
        expect(edges(assetMosaicRecipe({aoi: assetAoi()}))).toEqual([
            {reference: assetRef('projects/p/assets/aoi-image'), role: AOI},
            {reference: assetRef('projects/p/assets/mosaic'), role: ASSET_MOSAIC_PRIMARY_IMAGE}
        ])
    })
})

describe('incomplete and malformed references', () => {
    // A half-written reference must not resolve to nothing: silently dropping it turns a broken recipe
    // into one that looks like it has no dependency at all.
    it('reports a selected source with no id, instead of dropping it', () => {
        const recipe = ccdcSliceRecipeSource()
        recipe.model.source = {type: 'RECIPE_REF', bands: ['ndfi_coefs']}
        expect(edges(recipe)).toEqual([])
        expect(diagnostics(recipe)).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: PRIMARY_IMAGE, path: ['model', 'source']}
        ])
    })

    // An unselected source is not an error - every recipe starts that way.
    it('stays silent for a source that has not been selected yet', () => {
        const recipe = ccdcSliceRecipeSource()
        recipe.model.source = {}
        expect(directSourceEdges(recipe)).toEqual({edges: [], diagnostics: []})
    })

    // A model that carries an id but lost its section is half a selection, not an unmade one. Reading it as
    // unselected is how a dependency disappears from the graph without anything reporting it.
    it('reports a source that has an id but no section', () => {
        const recipe = ccdcSliceRecipeSource()
        recipe.model.source = {id: 'ccdc-1'}
        expect(edges(recipe)).toEqual([])
        expect(diagnostics(recipe)).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: PRIMARY_IMAGE, path: ['model', 'source']}
        ])
    })

    it('reports an AOI that has an id but no section', () => {
        const recipe = ccdcRecipe({aoi: {id: 'aoi-recipe-1'}, classification: null})
        expect(edges(recipe)).toEqual([])
        expect(diagnostics(recipe)).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: AOI, path: ['model', 'aoi']}
        ])
    })

    it('reports a source that is not an object at all', () => {
        const recipe = ccdcSliceRecipeSource()
        recipe.model.source = 'ccdc-1'
        expect(edges(recipe)).toEqual([])
        expect(diagnostics(recipe)).toEqual([
            {code: 'MALFORMED_REFERENCE', role: PRIMARY_IMAGE, path: ['model', 'source']}
        ])
    })

    it('reports an AOI shape it does not recognize as malformed', () => {
        const recipe = ccdcRecipe({aoi: {type: 'MYSTERY', id: 'x'}, classification: null})
        expect(edges(recipe)).toEqual([])
        expect(diagnostics(recipe)).toEqual([
            {code: 'MALFORMED_REFERENCE', role: AOI, path: ['model', 'aoi']}
        ])
    })

    it('reports a blank entry in an ordered asset list without disturbing the rest', () => {
        const recipe = ccdcPlanetRecipe()
        recipe.model.sources.assets = ['projects/p/assets/basemaps-a', '', 'projects/p/assets/basemaps-b']
        expect(referencedIds(recipe)).toEqual([
            'projects/p/assets/basemaps-a',
            'projects/p/assets/basemaps-b'
        ])
        expect(diagnostics(recipe)).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: SOURCE_IMAGERY, path: ['model', 'sources', 'assets', 1]}
        ])
    })

    it('reports a recipe training data set with no recipe', () => {
        const recipe = classificationRecipe()
        recipe.model.trainingData.dataSets[1] = {dataSetId: 'ds-2', name: 'Reused', type: 'RECIPE'}
        expect(referencedIds(recipe)).not.toContain('classification-0')
        expect(diagnostics(recipe)).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: TRAINING_DATA_SOURCE, path: ['model', 'trainingData', 'dataSets', 1]}
        ])
    })

    it('reports an input image with a section but no id', () => {
        const recipe = classificationRecipe()
        recipe.model.inputImagery.images[0] = {imageId: 'image-1', type: 'RECIPE_REF', bands: []}
        expect(diagnostics(recipe)).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: INPUT_IMAGE, path: ['model', 'inputImagery', 'images', 0]}
        ])
    })

    it('reports a non-string reference id as malformed', () => {
        const recipe = ccdcRecipe({classification: {id: 'classification-1'}})
        expect(diagnostics(recipe)).toEqual([
            {code: 'MALFORMED_REFERENCE', role: CLASSIFICATION_SOURCE, path: ['model', 'sources', 'classification']}
        ])
    })
})

// Every type-keyed lookup in this contract is driven by a persisted string. Reaching an inherited property
// turns Object.prototype into a declaration: the AOI map yields Object.prototype.toString as a reference
// constructor, which builds an edge whose reference is the string '[object Undefined]'.
describe('values inherited from Object.prototype', () => {
    it('does not accept an inherited property name as a reference type', () => {
        const recipe = ccdcRecipe({aoi: {type: 'toString', id: 'x'}, classification: null})
        expect(edges(recipe)).toEqual([])
        expect(diagnostics(recipe)).toEqual([
            {code: 'MALFORMED_REFERENCE', role: AOI, path: ['model', 'aoi']}
        ])
    })

    it('does not accept an inherited property name as a selection section', () => {
        const recipe = ccdcSliceRecipeSource()
        recipe.model.source = {type: 'constructor', id: 'x'}
        expect(edges(recipe)).toEqual([])
        expect(diagnostics(recipe)).toEqual([
            {code: 'MALFORMED_REFERENCE', role: PRIMARY_IMAGE, path: ['model', 'source']}
        ])
    })

    it('does not accept an inherited property name as a defined recipe type', () => {
        expect(directSourceEdges({id: 'x', type: 'toString', model: {}})).toEqual({
            edges: [],
            diagnostics: [{code: 'UNSUPPORTED_RECIPE_TYPE', path: []}]
        })
    })
})

// A container that exists but is not the shape the model declares cannot be read. Reporting it as empty
// drops every dependency it holds; letting the array method throw turns a broken recipe into an incidental
// JavaScript error at a shared boundary.
describe('malformed containers', () => {
    it('reports an asset list that is not a list', () => {
        const recipe = ccdcPlanetRecipe()
        recipe.model.sources.assets = 'projects/p/assets/basemaps-a'
        expect(edges(recipe)).toEqual([])
        expect(diagnostics(recipe)).toEqual([
            {code: 'MALFORMED_REFERENCE', role: SOURCE_IMAGERY, path: ['model', 'sources', 'assets']}
        ])
    })

    it('reports input imagery that is not a list', () => {
        const recipe = classificationRecipe()
        recipe.model.inputImagery.images = {}
        expect(diagnostics(recipe)).toContainEqual(
            {code: 'MALFORMED_REFERENCE', role: INPUT_IMAGE, path: ['model', 'inputImagery', 'images']}
        )
    })

    it('reports training data sets that are not a list', () => {
        const recipe = classificationRecipe()
        recipe.model.trainingData.dataSets = 'ds-1'
        expect(diagnostics(recipe)).toContainEqual(
            {code: 'MALFORMED_REFERENCE', role: TRAINING_DATA_SOURCE, path: ['model', 'trainingData', 'dataSets']}
        )
    })

    it('reports a model section that is not an object, instead of losing what it holds', () => {
        const recipe = classificationRecipe()
        recipe.model.inputImagery = 'mosaic-1'
        expect(diagnostics(recipe)).toContainEqual(
            {code: 'MALFORMED_REFERENCE', role: INPUT_IMAGE, path: ['model', 'inputImagery']}
        )
    })

    it('stays silent for an absent container', () => {
        const recipe = classificationRecipe()
        delete recipe.model.inputImagery
        delete recipe.model.trainingData
        expect(directSourceEdges(recipe)).toEqual({edges: [], diagnostics: []})
    })
})

describe('recipe types with no definition', () => {
    // Answering "no edges" for a type nobody has defined would read as "no dependencies" and quietly drop
    // whatever that type references.
    it('reports an undefined recipe type instead of claiming it has no sources', () => {
        expect(directSourceEdges({id: 'mosaic-1', type: 'MOSAIC', model: {aoi: recipeAoi()}})).toEqual({
            edges: [],
            diagnostics: [{code: 'UNSUPPORTED_RECIPE_TYPE', path: []}]
        })
    })
})
