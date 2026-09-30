import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {dependencyValidity} from '#sepal/recipe/source/dependencyValidity'

// Structural soundness of a closure, asked of the closure operation's own outcome. Statuses and codes are
// literals, so a production rename cannot pass unnoticed.

describe('the dependencies of a completed closure', () => {
    it('are valid when every reference resolves and none closes a cycle', () => {
        expect(dependencyValidity({status: 'COMPLETE', graph: graphOf([masking('R', {primary: 'S'}), masking('S')])}))
            .toEqual({status: 'VALID', diagnostics: []})
    })

    it('are invalid when a reference closes a cycle', () => {
        const graph = graphOf([masking('R', {primary: 'S'}), masking('S', {primary: 'R'})])

        expect(dependencyValidity({status: 'COMPLETE', graph})).toEqual({status: 'INVALID', diagnostics: graph.diagnostics})
    })

    it('are unavailable when a reference names a recipe that could not be had', () => {
        const graph = graphOf([masking('R', {primary: 'gone'})])

        expect(dependencyValidity({status: 'COMPLETE', graph}).status).toBe('UNAVAILABLE')
    })
})

// The last graph of a failed operation describes only what had been read when it stopped.
describe('the dependencies of a closure that failed', () => {
    it('are never valid, even when the graph read so far holds no diagnosis', () => {
        const graph = graphOf([masking('R', {primary: 'S'}), masking('S')])

        expect(graph.diagnostics).toEqual([])
        expect(dependencyValidity({status: 'FAILED', graph})).toEqual({status: 'UNAVAILABLE', diagnostics: []})
    })

    it('are invalid when a definitive diagnosis was established before it failed', () => {
        const graph = graphOf([masking('R', {primary: 'S', mask: 'gone'}), masking('S', {primary: 'R'})])

        expect(dependencyValidity({status: 'FAILED', graph}).status).toBe('INVALID')
    })
})

const masking = (id, {primary, mask} = {}) => ({
    id,
    type: 'MASKING',
    model: {
        ...(primary && {imageToMask: {type: 'RECIPE_REF', id: primary}}),
        ...(mask && {imageMask: {type: 'RECIPE_REF', id: mask}})
    }
})

const graphOf = ([rootRecipe, ...others]) => buildRecipeDependencyGraph({
    rootRecipe,
    recipesById: new Map([rootRecipe, ...others].map(recipe => [recipe.id, recipe]))
})
