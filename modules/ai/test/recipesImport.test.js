const recipes = require('#recipes')

describe('AI module -> #recipes import', () => {

    it('resolves listRecipeSpecs / getRecipeSpec / validateRecipe', () => {
        expect(typeof recipes.listRecipeSpecs).toBe('function')
        expect(typeof recipes.getRecipeSpec).toBe('function')
        expect(typeof recipes.validateRecipe).toBe('function')
        expect(typeof recipes.getRecipeSchema).toBe('function')
        expect(typeof recipes.getRecipeDefaults).toBe('function')
    })

    it('returns MOSAIC from the registry', () => {
        const ids = recipes.listRecipeSpecs().map(spec => spec.id)

        expect(ids).toContain('MOSAIC')
    })

    it('validates a valid MOSAIC model end-to-end through the imported API', () => {
        const defaults = recipes.getRecipeDefaults('MOSAIC')
        const model = {
            ...defaults,
            aoi: {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]}
        }

        expect(recipes.validateRecipe('MOSAIC', model)).toEqual([])
    })
})
