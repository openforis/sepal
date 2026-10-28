import {describe, expect, it} from 'vitest'

import {buildMapDependencyGraph} from './mapDependencyGraph'

// Pure: nothing is rendered, no component is mounted or exported for testing, no Redux store is created and
// no DOM is inspected. `loadedRecipes` is the real Redux shape - a plain object keyed by recipe id - because
// adapting that shape is the whole job of the module under test.
//
// Diagnostic codes are asserted as literals: they are the shared contract this layer consumes, and importing
// them would let a rename move producer and consumer together.

const recipeRef = id => ({type: 'RECIPE_REF', id})
const assetRef = id => ({type: 'ASSET', id})

const masking = (id, {imageToMask, imageMask} = {}) => ({id, type: 'MASKING', model: {imageToMask, imageMask}})

const loaded = (...recipes) =>
    recipes.reduce((byId, recipe) => ({...byId, [recipe.id]: recipe}), {})

const graph = (recipe, loadedRecipes) =>
    buildMapDependencyGraph({recipe, loadedRecipes})

const recipeIds = ({recipes}) => recipes.map(({id}) => id)

describe('buildMapDependencyGraph', () => {
    // root --PRIMARY--> left  --PRIMARY--> shared --PRIMARY--> asset
    //      --MASK-----> right --PRIMARY--> shared
    //                   left  --MASK-----> asset
    //
    // Every property the layer needs is in one shape: both roles are followed, the direct recipes are
    // themselves watched rather than only their children, the diamond is not duplicated, assets are not
    // mistaken for recipes, and a loaded recipe nothing references is not watched.
    const branching = () => {
        const root = masking('root', {imageToMask: recipeRef('left'), imageMask: recipeRef('right')})
        const left = masking('left', {imageToMask: recipeRef('shared'), imageMask: assetRef('projects/p/assets/left-mask')})
        const right = masking('right', {imageToMask: recipeRef('shared')})
        const shared = masking('shared', {imageToMask: assetRef('projects/p/assets/base')})
        const unrelated = masking('unrelated', {imageToMask: assetRef('projects/p/assets/other')})
        // A loaded recipe whose id is exactly one of the asset ids above. Nothing stops a user from saving a
        // recipe under such a name, and it makes "assets are not looked up" a real assertion rather than one
        // that passes because the lookup happened to miss.
        const collidingId = masking('projects/p/assets/base', {imageToMask: assetRef('projects/p/assets/decoy')})
        return {root, loadedRecipes: loaded(root, left, right, shared, unrelated, collidingId)}
    }

    it('watches the root and every reachable recipe once, in depth-first order', () => {
        const {root, loadedRecipes} = branching()
        expect(recipeIds(graph(root, loadedRecipes))).toEqual(['root', 'left', 'shared', 'right'])
    })

    // The defect this replaces returned only a dependency's CHILDREN, so a direct leaf contributed nothing.
    // `right` reaches `shared`, but `shared` is where the old traversal would have started reporting.
    it('watches a direct dependency itself, not only what it depends on', () => {
        const {root, loadedRecipes} = branching()
        expect(recipeIds(graph(root, loadedRecipes))).toContain('left')
        expect(recipeIds(graph(root, loadedRecipes))).toContain('right')
    })

    // Reached through PRIMARY_IMAGE from one branch and through MASK_IMAGE from the other. Watching it twice
    // breaks the once-only contract and bloats the watched state the layer carries and compares.
    it('watches a recipe reached down two branches exactly once', () => {
        const {root, loadedRecipes} = branching()
        expect(recipeIds(graph(root, loadedRecipes)).filter(id => id === 'shared')).toEqual(['shared'])
    })

    // Watching every loaded recipe would rerender this layer whenever any unrelated recipe was edited.
    it('does not watch a loaded recipe nothing references', () => {
        const {root, loadedRecipes} = branching()
        expect(recipeIds(graph(root, loadedRecipes))).not.toContain('unrelated')
    })

    // An asset id is not a recipe id, and the catalogue holds a recipe saved under one of these ids. A
    // traversal that looked assets up would find it and watch a recipe this layer does not depend on.
    it('never looks an asset reference up as a recipe, even when a recipe is saved under that id', () => {
        const {root, loadedRecipes} = branching()
        expect(loadedRecipes['projects/p/assets/base']).toBeDefined()
        expect(recipeIds(graph(root, loadedRecipes)))
            .toEqual(expect.not.arrayContaining(['projects/p/assets/base', 'projects/p/assets/left-mask']))
    })

    // The point of watching dependencies at all: an edit to an already-loaded dependency has to reach the
    // layer. Same root, same ids, different record - the watched list must differ.
    it('reflects the currently loaded version of a dependency', () => {
        const root = masking('root', {imageToMask: recipeRef('dependency')})
        const before = masking('dependency', {imageToMask: assetRef('projects/p/assets/before')})
        const after = masking('dependency', {imageToMask: assetRef('projects/p/assets/after')})

        expect(graph(root, loaded(root, before)).recipes).toContainEqual(before)
        expect(graph(root, loaded(root, after)).recipes).toContainEqual(after)
        expect(graph(root, loaded(root, before)).recipes).not.toEqual(graph(root, loaded(root, after)).recipes)
    })

    // The other half of the same property: editing something outside the graph must NOT change it, or the
    // layer reloads on every unrelated edit anywhere in the session.
    it('is unchanged when an unwatched recipe is edited', () => {
        const root = masking('root', {imageToMask: recipeRef('dependency')})
        const dependency = masking('dependency', {imageToMask: assetRef('projects/p/assets/base')})
        const before = masking('unrelated', {imageToMask: assetRef('projects/p/assets/one')})
        const after = masking('unrelated', {imageToMask: assetRef('projects/p/assets/two')})

        expect(graph(root, loaded(root, dependency, before)).recipes)
            .toEqual(graph(root, loaded(root, dependency, after)).recipes)
    })

    // Nothing about this adapter is Masking-shaped. A CCDC Slice reaches its source through `model.source`,
    // and the mosaic behind it reaches an AOI recipe through the AOI panel's own legacy 'RECIPE' vocabulary -
    // three edges across three persisted shapes, under two roles, in one walk. An adapter still tied to
    // Masking's two fields would return the root alone.
    it('traverses recipe types that are not Masking', () => {
        const slice = {id: 'slice', type: 'CCDC_SLICE', model: {source: recipeRef('mosaic')}}
        const mosaic = {
            id: 'mosaic',
            type: 'MOSAIC',
            model: {
                aoi: {type: 'RECIPE', id: 'aoi-recipe'},
                dates: {type: 'YEARLY_TIME_SCAN'},
                sources: {dataSets: {LANDSAT: ['LANDSAT_8']}}
            }
        }
        const aoiRecipe = masking('aoi-recipe', {imageToMask: assetRef('projects/p/assets/extent')})

        expect(recipeIds(graph(slice, loaded(slice, mosaic, aoiRecipe))))
            .toEqual(['slice', 'mosaic', 'aoi-recipe'])
    })

    // The old traversal had no visited set, so a saved cycle recursed until it failed. Computing the graph
    // must settle instead: the closing edge is reported and the call returns.
    it('settles on a cycle and reports the closing edge', () => {
        const root = masking('root', {imageToMask: recipeRef('child')})
        const child = masking('child', {imageToMask: recipeRef('root')})
        const result = graph(root, loaded(root, child))

        expect(recipeIds(result)).toEqual(['root', 'child'])
        expect(result.diagnostics).toEqual([
            {
                code: 'CYCLIC_DEPENDENCY',
                role: 'PRIMARY_IMAGE',
                path: ['model', 'imageToMask'],
                recipePath: ['root', 'child', 'root']
            }
        ])
    })
})
