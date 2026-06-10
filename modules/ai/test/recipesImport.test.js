import * as recipes from '#recipes'

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
})
