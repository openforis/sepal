import {AOI} from '#sepal/recipe/source/aoi'
import {directSourceEdges} from '#sepal/recipe/source/directSources'
import {PRIMARY_IMAGE as ASSET_MOSAIC_PRIMARY_IMAGE} from '#sepal/recipe/type/assetMosaic'
import {CLASSIFICATION_SOURCE, SOURCE_IMAGERY} from '#sepal/recipe/type/ccdc'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/ccdcSlice'
import {INPUT_IMAGE, TRAINING_DATA_SOURCE} from '#sepal/recipe/type/classification'

import {
    assetAoi,
    assetMosaicRecipe,
    bandMathRecipe,
    baytsAlertsRecipe,
    baytsHistoricalRecipe,
    ccdcPlanetRecipe,
    ccdcRecipe,
    ccdcSliceAssetSource,
    ccdcSliceRecipeSource,
    ccdcSliceWrappedAssetRecipeSource,
    changeAlertsRecipe,
    classChangeRecipe,
    classificationRecipe,
    COUNTRY_TABLE,
    indexChangeRecipe,
    maskingAssetImage,
    maskingRecipe,
    maskingRecipeImage,
    opticalMosaicRecipe,
    phenologyRecipe,
    planetMosaicRecipe,
    polygonAoi,
    pyeoAlertsRecipe,
    radarMosaicRecipe,
    recipeAoi,
    regressionRecipe,
    remappingRecipe,
    samplingDesignRecipe,
    stackRecipe,
    timeSeriesRecipe,
    unsupervisedClassificationRecipe
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
        expect(directSourceEdges({id: 'retired-1', type: 'RETIRED_RECIPE', model: {aoi: recipeAoi()}})).toEqual({
            edges: [],
            diagnostics: [{code: 'UNSUPPORTED_RECIPE_TYPE', path: []}]
        })
    })
})

// Roles are asserted as literals rather than imported from the definition, unlike the types above. These are
// the shared role contract, which outlives the definition that declares it: importing the constants would let
// a rename change production and this file together and still pass, which is the one thing a contract test
// has to refuse.
describe('MASKING', () => {
    // Both inputs change the output pixels, so both are dependencies. Which of them carries the wrapper's
    // semantic identity is a later question; this packet declares direct edges and roles only.
    it('declares the image it masks and the mask image', () => {
        expect(directSourceEdges(maskingRecipe()).edges).toEqual([
            {reference: recipeRef('classification-1'), role: 'PRIMARY_IMAGE', path: ['model', 'imageToMask']},
            {reference: assetRef('projects/p/assets/cloud-mask'), role: 'MASK_IMAGE', path: ['model', 'imageMask']}
        ])
    })

    // The role belongs to the field, not to the kind of source in it. A form that stores an asset as the
    // image to mask and a recipe as the mask has swapped the sources, not the roles.
    it('keeps each role with its field when the source kinds are reversed', () => {
        const recipe = maskingRecipe({
            imageToMask: maskingAssetImage(),
            imageMask: maskingRecipeImage()
        })
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: assetRef('projects/p/assets/cloud-mask'), role: 'PRIMARY_IMAGE', path: ['model', 'imageToMask']},
            {reference: recipeRef('classification-1'), role: 'MASK_IMAGE', path: ['model', 'imageMask']}
        ])
    })

    // A Masking recipe starts with neither input selected, and valuesToModel returns null until a section is
    // chosen. That is a recipe still being configured, not a broken one.
    it.each([
        ['an empty model', {}],
        ['unselected inputs', {imageToMask: null, imageMask: undefined}],
        ['inputs written and then cleared', {imageToMask: {}, imageMask: {}}]
    ])('emits nothing for %s', (_name, model) => {
        expect(directSourceEdges({id: 'masking-1', type: 'MASKING', model}))
            .toEqual({edges: [], diagnostics: []})
    })

    // The opposite case: a selection that names its section but lost its id is a dependency that vanished,
    // and must not read as an input nobody chose.
    it('reports a selected input that has no id', () => {
        const recipe = maskingRecipe({imageToMask: {type: 'RECIPE_REF', bands: ['class']}})
        expect(directSourceEdges(recipe).diagnostics).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: 'PRIMARY_IMAGE', path: ['model', 'imageToMask']}
        ])
    })

    it('reports a selected mask that has no id', () => {
        const recipe = maskingRecipe({imageMask: {type: 'ASSET'}})
        expect(directSourceEdges(recipe).diagnostics).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: 'MASK_IMAGE', path: ['model', 'imageMask']}
        ])
    })
})

// The model root is one value, so a root that cannot be read is one fact about the recipe. Left to the
// per-field walk it becomes neither: a falsy root is absorbed by a `|| {}` default and reads as an
// unconfigured recipe, and a truthy non-object is rediscovered by every declared field, so the same fact
// arrives once per field wearing a role that had nothing to do with it.
describe('a model root that cannot be read', () => {
    // Asserted against the type declaring the most fields, because both failures are proportional to that
    // count: three declarations are what make an absorbed root and a tripled diagnosis visible in one result.
    it.each([
        ['the empty string', ''],
        ['false', false],
        ['zero', 0],
        ['a string', 'a-recipe-model'],
        ['an empty array', []],
        ['an array', [{type: 'RECIPE_REF', id: 'x'}]]
    ])('reports %s once, at the root, with no role', (_name, model) => {
        expect(directSourceEdges({id: 'ccdc-1', type: 'CCDC', model})).toEqual({
            edges: [],
            diagnostics: [{code: 'MALFORMED_REFERENCE', path: ['model']}]
        })
    })

    // The counterpart the guard must not swallow: a recipe every type starts as, which stays distinct from a
    // root that is present and unreadable.
    it.each([
        ['an absent model', {id: 'ccdc-1', type: 'CCDC', model: undefined}],
        ['a null model', {id: 'ccdc-1', type: 'CCDC', model: null}],
        ['a recipe with no model at all', {id: 'ccdc-1', type: 'CCDC'}]
    ])('treats %s as an empty unconfigured model', (_name, recipe) => {
        expect(directSourceEdges(recipe)).toEqual({edges: [], diagnostics: []})
    })
})

// The rest of the production catalogue. Roles are asserted as literals throughout, for the reason recorded
// above the MASKING block: they are the shared contract, and importing them would let a rename move
// production and this file together.
//
// One test per graph property per type, not a matrix: what varies between these types is which persisted
// shape holds the reference, so that is what each case pins.

describe('mosaics', () => {
    // optical/mosaic.js, radar/mosaic.js and planet/mosaic.js each clip to model.aoi and read nothing else
    // external. The GUI declares no dependencies for any of them, which is the gap: an AOI is routinely a
    // recipe or a table.
    it('declares the AOI of an optical mosaic', () => {
        expect(directSourceEdges(opticalMosaicRecipe()).edges).toEqual([
            {reference: {type: 'ASSET', id: COUNTRY_TABLE}, role: 'AOI', path: ['model', 'aoi']}
        ])
    })

    it('declares a recipe-backed AOI of a radar mosaic', () => {
        expect(directSourceEdges(radarMosaicRecipe()).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'aoi-recipe-1'}, role: 'AOI', path: ['model', 'aoi']}
        ])
    })

    // planet/collection.js merges these in model order, so order is part of the request. A drawn polygon AOI
    // contributes no edge, which keeps this case about the asset list alone.
    it('declares Planet source assets in model order', () => {
        expect(directSourceEdges(planetMosaicRecipe()).edges).toEqual([
            {reference: {type: 'ASSET', id: 'projects/p/assets/basemaps-a'}, role: 'SOURCE_IMAGERY', path: ['model', 'sources', 'assets', 0]},
            {reference: {type: 'ASSET', id: 'projects/p/assets/basemaps-b'}, role: 'SOURCE_IMAGERY', path: ['model', 'sources', 'assets', 1]}
        ])
    })
})

describe('collection-based recipes', () => {
    // TIME_SERIES and PHENOLOGY hand model.sources to the same builder CCDC uses, so they inherit its optional
    // classification and its Planet asset list along with their own AOI.
    // `sources.assets` holds bare id strings, so the completeness audit is blind to them: an implementation
    // that declared the AOI and the classification but dropped the asset list would pass every structural
    // check. Only asserting the edges and their order catches it.
    it('declares the AOI, optional Classification and ordered source assets of a time series', () => {
        expect(directSourceEdges(timeSeriesRecipe()).edges).toEqual([
            {reference: {type: 'ASSET', id: 'projects/p/assets/aoi-image'}, role: 'AOI', path: ['model', 'aoi']},
            {reference: {type: 'RECIPE_REF', id: 'classification-1'}, role: 'CLASSIFICATION_SOURCE', path: ['model', 'sources', 'classification']},
            {reference: {type: 'ASSET', id: 'projects/p/assets/basemaps-a'}, role: 'SOURCE_IMAGERY', path: ['model', 'sources', 'assets', 0]},
            {reference: {type: 'ASSET', id: 'projects/p/assets/basemaps-b'}, role: 'SOURCE_IMAGERY', path: ['model', 'sources', 'assets', 1]}
        ])
    })

    // The optional half is absent here, so the asset list must still be declared and must not shift position.
    it('declares source assets of a phenology recipe that has no Classification', () => {
        expect(directSourceEdges(phenologyRecipe()).edges).toEqual([
            {reference: {type: 'ASSET', id: COUNTRY_TABLE}, role: 'AOI', path: ['model', 'aoi']},
            {reference: {type: 'ASSET', id: 'projects/p/assets/basemaps-c'}, role: 'SOURCE_IMAGERY', path: ['model', 'sources', 'assets', 0]}
        ])
    })
})

describe('alert recipes', () => {
    // changeAlerts.js calls imageFactory(model.reference) whatever its type is, so an asset reference is as
    // much a dependency as a recipe one. The GUI declares it only when it is a RECIPE_REF.
    // referenceSync.jsx copies the referenced CCDC recipe's whole `sources` submodel, so Change Alerts owns
    // the same classification and asset dependencies CCDC does, on top of the reference itself.
    it('declares the reference, Classification and ordered source assets of change alerts', () => {
        expect(directSourceEdges(changeAlertsRecipe()).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'ccdc-1'}, role: 'PRIMARY_IMAGE', path: ['model', 'reference']},
            {reference: {type: 'RECIPE_REF', id: 'classification-1'}, role: 'CLASSIFICATION_SOURCE', path: ['model', 'sources', 'classification']},
            {reference: {type: 'ASSET', id: 'projects/p/assets/basemaps-a'}, role: 'SOURCE_IMAGERY', path: ['model', 'sources', 'assets', 0]},
            {reference: {type: 'ASSET', id: 'projects/p/assets/basemaps-b'}, role: 'SOURCE_IMAGERY', path: ['model', 'sources', 'assets', 1]}
        ])
    })

    // The reference is independent of the sources it was copied from: an asset reference is resolved exactly
    // as a recipe one is, which is the half the GUI declaration drops.
    it('declares an asset reference of change alerts', () => {
        const recipe = changeAlertsRecipe({
            reference: {type: 'ASSET', id: 'projects/p/assets/segments', dateFormat: 0},
            classification: null,
            assets: []
        })
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: {type: 'ASSET', id: 'projects/p/assets/segments'}, role: 'PRIMARY_IMAGE', path: ['model', 'reference']}
        ])
    })

    it('declares the AOI and Classification of PyEO alerts', () => {
        expect(directSourceEdges(pyeoAlertsRecipe()).edges).toEqual([
            {reference: {type: 'ASSET', id: COUNTRY_TABLE}, role: 'AOI', path: ['model', 'aoi']},
            {reference: {type: 'RECIPE_REF', id: 'classification-1'}, role: 'CLASSIFICATION_SOURCE', path: ['model', 'sources', 'classification']}
        ])
    })

    it('declares the AOI of a BAYTS historical recipe', () => {
        expect(directSourceEdges(baytsHistoricalRecipe()).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'aoi-recipe-1'}, role: 'AOI', path: ['model', 'aoi']}
        ])
    })

    // Three references in one recipe, two of them buried in an options submodel that no dependency
    // declaration has ever looked at.
    it('declares the reference, previous alerts and wetland mask of BAYTS alerts', () => {
        expect(directSourceEdges(baytsAlertsRecipe()).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'bayts-historical-1'}, role: 'PRIMARY_IMAGE', path: ['model', 'reference']},
            {reference: {type: 'ASSET', id: 'projects/p/assets/previous-alerts'}, role: 'PREVIOUS_ALERTS', path: ['model', 'baytsAlertsOptions', 'previousAlertsAsset']},
            {reference: {type: 'ASSET', id: 'users/wiell/SepalResources/wetlandMask_v1'}, role: 'WETLAND_MASK', path: ['model', 'baytsAlertsOptions', 'wetlandMaskAsset']}
        ])
    })

    // The two asset fields in that submodel are persisted differently and must be extracted differently. A
    // selection that was written and lost its id is a broken dependency and says so; a blank bare id is a
    // constant image and says nothing. Swapping the two extractions would silently invert both answers.
    it('separates a broken previous-alerts selection from a blank wetland mask', () => {
        const recipe = baytsAlertsRecipe({previousAlertsAsset: {type: 'ASSET'}, wetlandMaskAsset: ''})
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'bayts-historical-1'}, role: 'PRIMARY_IMAGE', path: ['model', 'reference']}
        ])
        expect(directSourceEdges(recipe).diagnostics).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: 'PREVIOUS_ALERTS', path: ['model', 'baytsAlertsOptions', 'previousAlertsAsset']}
        ])
    })

    // options.jsx writes `undefined` when the field is cleared, and undefined does not survive JSON, so a
    // cleared previous-alerts asset is an ABSENT key in a persisted model - an unmade selection, not a broken
    // one. Deleted rather than passed as undefined, which would only re-select the builder's default.
    it('emits no edge for a BAYTS alerts recipe with no wetland mask or previous alerts', () => {
        const recipe = baytsAlertsRecipe({wetlandMaskAsset: ''})
        delete recipe.model.baytsAlertsOptions.previousAlertsAsset
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'bayts-historical-1'}, role: 'PRIMARY_IMAGE', path: ['model', 'reference']}
        ])
        expect(directSourceEdges(recipe).diagnostics).toEqual([])
    })
})

describe('input imagery recipes', () => {
    // panels/inputImagery/inputImage.jsx persists `recipe` and `asset` alongside `id`, and does not clear them
    // when the section changes. Image 1 here is a RECIPE_REF carrying a stale asset id from a previous
    // selection; only `type` and `id` may decide the edge.
    it('resolves an input image from its canonical type and id, not its stale bare-id copies', () => {
        expect(directSourceEdges(stackRecipe()).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'mosaic-1'}, role: 'INPUT_IMAGE', path: ['model', 'inputImagery', 'images', 0]},
            {reference: {type: 'ASSET', id: 'projects/p/assets/covariates'}, role: 'INPUT_IMAGE', path: ['model', 'inputImagery', 'images', 1]}
        ])
    })

    // The same persisted submodel in four more recipe types. Asserting each keeps a later divergence in any
    // one of them from being hidden by the shape they happen to share today.
    it.each([
        ['BAND_MATH', bandMathRecipe()],
        ['REMAPPING', remappingRecipe()],
        ['REGRESSION', regressionRecipe()],
        ['UNSUPERVISED_CLASSIFICATION', unsupervisedClassificationRecipe()]
    ])('declares the input imagery of %s', (_name, recipe) => {
        expect(directSourceEdges(recipe).edges).toContainEqual(
            {reference: {type: 'RECIPE_REF', id: 'mosaic-1'}, role: 'INPUT_IMAGE', path: ['model', 'inputImagery', 'images', 0]}
        )
    })

    // The complete edge list, because what matters is what is NOT an edge. regression.js loads only dataSets
    // of type RECIPE: an EE_TABLE was already read into referenceData, and a SAMPLE_IMAGE's recipe and asset
    // fields record what it sampled, not something execution resolves. Emitting either would pin sources the
    // recipe never reads.
    it('resolves only input imagery and the reused RECIPE dataset of a regression', () => {
        expect(directSourceEdges(regressionRecipe()).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'mosaic-1'}, role: 'INPUT_IMAGE', path: ['model', 'inputImagery', 'images', 0]},
            {reference: {type: 'ASSET', id: 'projects/p/assets/covariates'}, role: 'INPUT_IMAGE', path: ['model', 'inputImagery', 'images', 1]},
            {reference: {type: 'RECIPE_REF', id: 'regression-0'}, role: 'TRAINING_DATA_SOURCE', path: ['model', 'trainingData', 'dataSets', 2]}
        ])
    })

    // Clustering has no training data at all, so its edges are its input imagery and nothing else.
    it('declares nothing beyond input imagery for an unsupervised classification', () => {
        expect(directSourceEdges(unsupervisedClassificationRecipe()).edges).toHaveLength(2)
    })
})

describe('change recipes', () => {
    // Two independent selections, each of which can be a recipe or an asset, and whose roles are the whole
    // meaning of the recipe: swapping them inverts the change being measured.
    it('declares the from and to images of a class change', () => {
        expect(directSourceEdges(classChangeRecipe()).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'classification-1'}, role: 'FROM_IMAGE', path: ['model', 'fromImage']},
            {reference: {type: 'ASSET', id: 'projects/p/assets/classification-2020'}, role: 'TO_IMAGE', path: ['model', 'toImage']}
        ])
    })

    it('declares the from and to images of an index change', () => {
        expect(directSourceEdges(indexChangeRecipe()).edges).toEqual([
            {reference: {type: 'ASSET', id: 'projects/p/assets/ndvi-2018'}, role: 'FROM_IMAGE', path: ['model', 'fromImage']},
            {reference: {type: 'RECIPE_REF', id: 'mosaic-1'}, role: 'TO_IMAGE', path: ['model', 'toImage']}
        ])
    })
})

describe('SAMPLING_DESIGN', () => {
    // stratificationModel.js writes assetId AND recipeId unconditionally, so a persisted model normally holds
    // the one it is not using. `type` alone decides, and reading the wrong field would silently stratify the
    // design on a source the user abandoned.
    it('reads only recipeId when the stratification is a recipe', () => {
        expect(directSourceEdges(samplingDesignRecipe()).edges).toEqual([
            {reference: {type: 'ASSET', id: COUNTRY_TABLE}, role: 'AOI', path: ['model', 'aoi']},
            {reference: {type: 'RECIPE_REF', id: 'classification-1'}, role: 'STRATIFICATION', path: ['model', 'stratification', 'recipeId']}
        ])
    })

    it('reads only assetId when the stratification is an asset', () => {
        const recipe = samplingDesignRecipe({stratification: {type: 'ASSET'}})
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: {type: 'ASSET', id: COUNTRY_TABLE}, role: 'AOI', path: ['model', 'aoi']},
            {reference: {type: 'ASSET', id: 'projects/p/assets/stale-stratification'}, role: 'STRATIFICATION', path: ['model', 'stratification', 'assetId']}
        ])
    })

    // An unstratified design resolves neither: stratificationImage.js returns a constant image before it looks
    // at type, recipeId or assetId. Both ids are still persisted here, which is the case that would otherwise
    // pin a source the design does not use.
    it('reads neither id when the stratification is skipped', () => {
        const recipe = samplingDesignRecipe({stratification: {skip: true}})
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: {type: 'ASSET', id: COUNTRY_TABLE}, role: 'AOI', path: ['model', 'aoi']}
        ])
        expect(directSourceEdges(recipe).diagnostics).toEqual([])
    })

    // The legacy form-toggle shape of the same flag, which stratificationSkip.js still recognizes.
    it('reads neither id when the stratification is skipped in the legacy array shape', () => {
        const recipe = samplingDesignRecipe({stratification: {skip: [true]}})
        expect(directSourceEdges(recipe).edges).toHaveLength(1)
    })

    // `type` decides, so a model that lost it decides nothing. Reading assetId because the type is merely
    // "not RECIPE" would resolve whichever id happened to survive - and both always do.
    it('reports a stratification that has no type', () => {
        const recipe = samplingDesignRecipe({stratification: {type: undefined}})
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: {type: 'ASSET', id: COUNTRY_TABLE}, role: 'AOI', path: ['model', 'aoi']}
        ])
        expect(directSourceEdges(recipe).diagnostics).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: 'STRATIFICATION', path: ['model', 'stratification']}
        ])
    })

    // A type this contract does not understand is not an asset by default. The recipe cannot run, and saying
    // so is the difference between a controlled error and a design stratified on an abandoned source.
    it('reports a stratification whose type is not understood', () => {
        const recipe = samplingDesignRecipe({stratification: {type: 'SOMETHING_ELSE'}})
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: {type: 'ASSET', id: COUNTRY_TABLE}, role: 'AOI', path: ['model', 'aoi']}
        ])
        expect(directSourceEdges(recipe).diagnostics).toEqual([
            {code: 'MALFORMED_REFERENCE', role: 'STRATIFICATION', path: ['model', 'stratification']}
        ])
    })

    it('reports a stratification that is not a record at all', () => {
        const recipe = samplingDesignRecipe()
        recipe.model.stratification = 'stratified'
        expect(directSourceEdges(recipe).diagnostics).toEqual([
            {code: 'MALFORMED_REFERENCE', role: 'STRATIFICATION', path: ['model', 'stratification']}
        ])
    })

    // Skipping is decided before the type is read, exactly as stratificationImage.js returns its constant
    // image before looking at one. A skipped design with no type is unstratified, not broken.
    it('stays source-free when a skipped stratification also has no type', () => {
        const recipe = samplingDesignRecipe({stratification: {skip: true, type: undefined}})
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: {type: 'ASSET', id: COUNTRY_TABLE}, role: 'AOI', path: ['model', 'aoi']}
        ])
        expect(directSourceEdges(recipe).diagnostics).toEqual([])
    })

    // The AOI is independent of the stratification: a skipped design is still clipped.
    it('keeps the AOI independent of the stratification', () => {
        const recipe = samplingDesignRecipe({aoi: recipeAoi(), stratification: {skip: true}})
        expect(directSourceEdges(recipe).edges).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'aoi-recipe-1'}, role: 'AOI', path: ['model', 'aoi']}
        ])
    })
})
