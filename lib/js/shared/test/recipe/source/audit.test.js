import {auditDirectSources} from './audit.js'
import {
    assetMosaicRecipe,
    ccdcPlanetRecipe,
    ccdcRecipe,
    ccdcSliceAssetSource,
    ccdcSliceRecipeSource,
    ccdcSliceWrappedAssetRecipeSource,
    classificationRecipe,
    recipeAoi
} from './fixtures.js'

const codes = recipe => auditDirectSources(recipe).diagnostics.map(({code}) => code)

describe('auditDirectSources', () => {
    // The guard only means something if the models it was written against pass it.
    it.each([
        ['CCDC', ccdcRecipe()],
        ['CCDC with a recipe-backed AOI', ccdcRecipe({aoi: recipeAoi()})],
        ['CCDC over Planet assets', ccdcPlanetRecipe()],
        ['CCDC_SLICE over a recipe', ccdcSliceRecipeSource()],
        ['CCDC_SLICE over an asset', ccdcSliceAssetSource()],
        ['CCDC_SLICE over an asset-backed recipe', ccdcSliceWrappedAssetRecipeSource()],
        ['CLASSIFICATION', classificationRecipe()],
        ['ASSET_MOSAIC', assetMosaicRecipe()]
    ])('accepts the declared references of %s', (_name, recipe) => {
        expect(auditDirectSources(recipe).diagnostics).toEqual([])
    })

    // The point of the guard: a canonical reference added to a migrated model in a later packet fails
    // loudly here instead of being silently excluded from the dependency graph.
    it('rejects a canonical reference at an undeclared path', () => {
        const recipe = ccdcRecipe()
        recipe.model.fillImage = {type: 'RECIPE_REF', id: 'fill-1'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([
            {code: 'UNDECLARED_REFERENCE', path: ['model', 'fillImage']}
        ])
    })

    it('rejects a canonical reference nested in an undeclared list', () => {
        const recipe = classificationRecipe()
        recipe.model.extraImagery = [{type: 'ASSET', id: 'projects/p/assets/extra'}]
        expect(auditDirectSources(recipe).diagnostics).toEqual([
            {code: 'UNDECLARED_REFERENCE', path: ['model', 'extraImagery', 0]}
        ])
    })

    // Recognition is by shape, not by a usable id: an undeclared reference with a missing id is exactly the
    // half-migrated case that would otherwise slip through.
    it('rejects an undeclared reference that has no id yet', () => {
        const recipe = ccdcSliceAssetSource()
        recipe.model.maskImage = {type: 'ASSET'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([
            {code: 'UNDECLARED_REFERENCE', path: ['model', 'maskImage']}
        ])
    })

    // Legacy AOI shapes count as references, so putting one somewhere undeclared has to fail too.
    it('rejects a legacy recipe reference at an undeclared path', () => {
        const recipe = ccdcRecipe()
        recipe.model.strayAoi = {type: 'RECIPE', id: 'aoi-recipe-2'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([
            {code: 'UNDECLARED_REFERENCE', path: ['model', 'strayAoi']}
        ])
    })

    // The AOI model's table shape is the other half of the audit's legacy vocabulary, and the only one
    // nothing else witnesses: recognizing it is what stops an undeclared country or table AOI from reading
    // as ordinary configuration.
    it('rejects a legacy table reference at an undeclared path', () => {
        const recipe = ccdcRecipe()
        recipe.model.strayTable = {type: 'EE_TABLE', id: 'projects/p/assets/plots'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([
            {code: 'UNDECLARED_REFERENCE', path: ['model', 'strayTable']}
        ])
    })

    // A field declared as evidence stays evidence even when it happens to hold a reference-shaped value.
    it('accepts a reference-shaped value inside a field classified as a non-edge', () => {
        const recipe = assetMosaicRecipe()
        recipe.model.assetDetails.metadata.properties.source = {type: 'ASSET', id: 'projects/p/assets/other'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([])
    })

    // The audit uses the declaration's own diagnostics to decide which paths are accounted for. Dropping
    // them from the result turns a recipe whose declared source lost its id into a clean bill of health -
    // the one answer that must never come back empty.
    it('keeps the diagnostics the declaration produced', () => {
        const recipe = ccdcSliceRecipeSource()
        recipe.model.source = {type: 'RECIPE_REF'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([
            {code: 'INCOMPLETE_REFERENCE', role: 'PRIMARY_IMAGE', path: ['model', 'source']}
        ])
    })

    it('reports a broken declared source and an undeclared reference together', () => {
        const recipe = ccdcSliceRecipeSource()
        recipe.model.source = {type: 'RECIPE_REF'}
        recipe.model.fillImage = {type: 'ASSET', id: 'projects/p/assets/fill'}
        expect(codes(recipe)).toEqual(['INCOMPLETE_REFERENCE', 'UNDECLARED_REFERENCE'])
    })

    // Recognizing a reference by an inherited property name would invent one here.
    it('does not treat an inherited property name as a reference', () => {
        const recipe = ccdcSliceRecipeSource()
        recipe.model.stray = {type: 'toString', id: 'x'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([])
    })

    // An exact classification excuses the record for being reference-shaped; it does not excuse everything
    // the record holds. Stopping at it turns a whole subtree into a blind spot - the opposite of what the
    // exact form exists for.
    it('rejects a reference nested inside a classified non-edge', () => {
        const recipe = classificationRecipe()
        recipe.model.trainingData.dataSets[3].futureSource = {type: 'RECIPE_REF', id: 'future'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([
            {code: 'UNDECLARED_REFERENCE', path: ['model', 'trainingData', 'dataSets', 3, 'futureSource']}
        ])
    })

    // The declared edge here is read out of a record, not off a reference object, so the record's other
    // fields are ordinary model state that still has to be inventoried.
    it('rejects a reference nested inside a record it already reads a reference from', () => {
        const recipe = classificationRecipe()
        recipe.model.trainingData.dataSets[1].futureSource = {type: 'ASSET', id: 'projects/p/assets/future'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([
            {code: 'UNDECLARED_REFERENCE', path: ['model', 'trainingData', 'dataSets', 1, 'futureSource']}
        ])
    })

    // The counterpart: a declared source object is a reference, and its snapshot is evidence copied off
    // that one source. sourceSync spreads the asset's own properties in there, so descending would report
    // a provenance property as a second dependency.
    it('does not descend into a declared source snapshot', () => {
        const recipe = ccdcSliceWrappedAssetRecipeSource()
        recipe.model.source.provenance = {type: 'RECIPE_REF', id: 'recipe-that-produced-the-asset'}
        expect(auditDirectSources(recipe).diagnostics).toEqual([])
    })

    // An empty diagnostics array from a type with no definition would be a false all-clear.
    it('does not claim completeness for an undefined recipe type', () => {
        expect(codes({id: 'mosaic-1', type: 'MOSAIC', model: {aoi: recipeAoi()}}))
            .toEqual(['UNSUPPORTED_RECIPE_TYPE'])
    })
})
