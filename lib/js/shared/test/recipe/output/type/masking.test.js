import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Persisted types and the role are written as literals: a production rename must not make this pass.
const declaration = () => recipeType('MASKING').imageOutput

const ccdc = id => ({id, type: 'CCDC', model: {}})

const masking = (id, {primary, mask}) => ({
    id,
    type: 'MASKING',
    model: {imageToMask: primary, imageMask: mask}
})

const recipeSelection = id => ({type: 'RECIPE_REF', id})

const PRIMARY_BANDS = ['tStart', 'ndvi_coefs']
const MASK_BANDS = ['forest_mask']
const observed = names => names.map(name => ({name}))

// What CCDC declares of those bands. Masking states none of it: the whole schema arrives from its primary
// input, which is why a coefficient band keeps the second array dimension only CCDC knows about.
const PRESERVED_BANDS = [
    {name: 'tStart', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'},
    {name: 'ndvi_coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'}
]

// A real MASKING over a real CCDC, with a second CCDC as the mask. The mask carries different bands, so
// following MASK_IMAGE - or merging both inputs - produces a visibly different schema.
const maskedCcdc = () => {
    const root = masking('masked-1', {primary: recipeSelection('ccdc-1'), mask: recipeSelection('ccdc-mask')})
    const recipes = [root, ccdc('ccdc-1'), ccdc('ccdc-mask')]
    return {
        root,
        recipes,
        graph: buildRecipeDependencyGraph({
            rootRecipe: root,
            recipesById: new Map(recipes.map(recipe => [recipe.id, recipe]))
        }),
        observations: {
            'RECIPE_REF:ccdc-1': {bands: observed(PRIMARY_BANDS)},
            'RECIPE_REF:ccdc-mask': {bands: observed(MASK_BANDS)}
        }
    }
}

// The runtime obtains declarations from the shared registry alone - no second registry, no type switch.
const resolve = ({graph, observations}) => resolveImageOutput({
    graph,
    declarationFor: recipe => recipeType(recipe.type)?.imageOutput,
    observationFor: ({type, id}) => observations[`${type}:${id}`]
})

describe('the registered MASKING output declaration', () => {
    it('preserves the output of the literal PRIMARY_IMAGE role', () => {
        expect(declaration().role).toBe('PRIMARY_IMAGE')
    })
})

describe('resolving MASKING over CCDC through the registry', () => {
    it('builds a graph with both edges and no diagnostics', () => {
        const {graph} = maskedCcdc()
        expect(graph.diagnostics).toEqual([])
        expect(graph.edges.map(({role, reference: {id}}) => [role, id])).toEqual([
            ['PRIMARY_IMAGE', 'ccdc-1'],
            ['MASK_IMAGE', 'ccdc-mask']
        ])
    })

    it('keeps the MASKING recipe as the execution reference while preserving CCDC bands and policies', () => {
        const {graph, observations} = maskedCcdc()

        expect(resolve({graph, observations})).toEqual({
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
                output: {kind: 'IMAGE', bands: PRESERVED_BANDS},
                evidence: []
            },
            diagnostics: []
        })
    })

    // The mask changes pixels and validity. It does not supply the band schema or the export policies, so a
    // resolution that followed MASK_IMAGE, or merged both inputs, is visible here as the wrong band names.
    it('never takes its schema from the mask', () => {
        const {graph, observations} = maskedCcdc()
        const {description} = resolve({graph, observations})
        const names = description?.output?.bands?.map(({name}) => name)

        expect(names).toEqual(PRIMARY_BANDS)
        expect(names).not.toContain('forest_mask')
    })

    it('modifies neither the recipes nor the observations it was given', () => {
        const {graph, recipes, observations} = maskedCcdc()
        const before = JSON.stringify({recipes, observations})

        expect(resolve({graph, observations}).description).toEqual({
            executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
            output: {kind: 'IMAGE', bands: PRESERVED_BANDS},
            evidence: []
        })
        expect(JSON.stringify({recipes, observations})).toEqual(before)
    })
})

describe('MASKING over an optical mosaic', () => {
    it('offers the bands the mosaic makes available, generated ones included, with their encoding', () => {
        const mosaic = {
            id: 'mosaic-1',
            type: 'MOSAIC',
            model: {
                sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
                compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
            }
        }
        const root = masking('masked-1', {primary: recipeSelection('mosaic-1')})
        const graph = buildRecipeDependencyGraph({
            rootRecipe: root,
            recipesById: new Map([root, mosaic].map(recipe => [recipe.id, recipe]))
        })

        const {description} = resolve({graph, observations: {}})

        const nbr = description.output.bands.find(({name}) => name === 'nbr')
        expect(description.executionReference).toEqual({type: 'RECIPE_REF', id: 'masked-1'})
        expect(nbr).toEqual({name: 'nbr', dataType: {arrayDimensions: 0}, encoding: {scale: 0.0001, offset: 0, unit: '1'}})
    })
})
