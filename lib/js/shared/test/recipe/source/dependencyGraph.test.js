import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Test-local builders rather than the fixtures module: those models are the CCDC proving graph, reconstructed
// from production writers and shaped to exercise extraction. What matters here is graph topology, so the
// smallest model each registered definition accepts keeps each test's shape readable in one line.
//
// Diagnostic codes are asserted as literals. They are the contract this graph publishes to consumers that do
// not import it; importing the constants would let a rename change production and this file together.

const recipeRef = id => ({type: 'RECIPE_REF', id})
const assetRef = id => ({type: 'ASSET', id})

const masking = (id, {imageToMask, imageMask} = {}) => ({id, type: 'MASKING', model: {imageToMask, imageMask}})

const slice = (id, source) => ({id, type: 'CCDC_SLICE', model: {source}})

// Counts every lookup, so a test can tell "expanded once" from "expanded repeatedly and deduplicated on the
// way out". The two are indistinguishable in the returned graph and very different in cost.
class CountingRecipes extends Map {
    constructor(records) {
        super(records.map(record => [record.id, record]))
        this.lookups = []
    }

    get(id) {
        this.lookups.push(id)
        return super.get(id)
    }
}

const graph = (rootRecipe, records = []) =>
    buildRecipeDependencyGraph({rootRecipe, recipesById: new CountingRecipes(records)})

const recipeIds = result => result.recipes.map(({id}) => id)

const edgeSummaries = result =>
    result.edges.map(({sourceRecipeId, reference, role}) => [sourceRecipeId, role, reference.id])

describe('buildRecipeDependencyGraph', () => {
    // root --PRIMARY_IMAGE--> nested --PRIMARY_IMAGE--> slice --PRIMARY_IMAGE--> asset
    //      --MASK_IMAGE-----> asset
    it('reaches every recipe once and keeps every direct edge with its source, role and model path', () => {
        const result = graph(
            masking('root', {imageToMask: recipeRef('nested'), imageMask: assetRef('projects/p/assets/mask')}),
            [
                masking('nested', {imageToMask: recipeRef('slice')}),
                slice('slice', assetRef('projects/p/assets/segments'))
            ]
        )
        expect(recipeIds(result)).toEqual(['root', 'nested', 'slice'])
        expect(result.edges).toEqual([
            {sourceRecipeId: 'root', reference: recipeRef('nested'), role: 'PRIMARY_IMAGE', path: ['model', 'imageToMask']},
            {sourceRecipeId: 'root', reference: assetRef('projects/p/assets/mask'), role: 'MASK_IMAGE', path: ['model', 'imageMask']},
            {sourceRecipeId: 'nested', reference: recipeRef('slice'), role: 'PRIMARY_IMAGE', path: ['model', 'imageToMask']},
            {sourceRecipeId: 'slice', reference: assetRef('projects/p/assets/segments'), role: 'PRIMARY_IMAGE', path: ['model', 'source']}
        ])
        expect(result.diagnostics).toEqual([])
    })

    // Roles are opaque here. A mask input is not the wrapper's semantic source, but it is just as much a
    // dependency, and deciding otherwise is a later milestone rather than a traversal rule.
    it('traverses a recipe reached through a non-primary role', () => {
        const result = graph(
            masking('root', {imageToMask: assetRef('projects/p/assets/base'), imageMask: recipeRef('via-mask')}),
            [masking('via-mask', {imageToMask: assetRef('projects/p/assets/inner')})]
        )
        expect(recipeIds(result)).toEqual(['root', 'via-mask'])
        expect(edgeSummaries(result)).toEqual([
            ['root', 'PRIMARY_IMAGE', 'projects/p/assets/base'],
            ['root', 'MASK_IMAGE', 'via-mask'],
            ['via-mask', 'PRIMARY_IMAGE', 'projects/p/assets/inner']
        ])
    })

    // root --> left --> shared, root --> right --> shared. Both arrivals are real edges; only the expansion
    // is shared.
    it('expands a diamond dependency once while keeping both incoming edges', () => {
        const recipesById = new CountingRecipes([
            masking('left', {imageToMask: recipeRef('shared')}),
            masking('right', {imageToMask: recipeRef('shared')}),
            slice('shared', assetRef('projects/p/assets/segments'))
        ])
        const result = buildRecipeDependencyGraph({
            rootRecipe: masking('root', {imageToMask: recipeRef('left'), imageMask: recipeRef('right')}),
            recipesById
        })
        expect(recipeIds(result)).toEqual(['root', 'left', 'shared', 'right'])
        expect(edgeSummaries(result)).toEqual([
            ['root', 'PRIMARY_IMAGE', 'left'],
            ['root', 'MASK_IMAGE', 'right'],
            ['left', 'PRIMARY_IMAGE', 'shared'],
            ['shared', 'PRIMARY_IMAGE', 'projects/p/assets/segments'],
            ['right', 'PRIMARY_IMAGE', 'shared']
        ])
        // Deduplicating the output after expanding twice would look identical above and cost twice as much on
        // a graph of any depth. The lookup count is what separates them.
        expect(recipesById.lookups.filter(id => id === 'shared')).toEqual(['shared'])
    })

    // An asset is a leaf of this graph. Looking one up would at best miss and at worst collide with a recipe
    // id, and either way it invites an asset round trip into a module that must stay pure.
    it('keeps asset edges without ever looking an asset up as a recipe', () => {
        const recipesById = new CountingRecipes([masking('nested', {imageToMask: assetRef('projects/p/assets/inner')})])
        const result = buildRecipeDependencyGraph({
            rootRecipe: masking('root', {imageToMask: recipeRef('nested'), imageMask: assetRef('projects/p/assets/mask')}),
            recipesById
        })
        expect(recipesById.lookups).toEqual(['nested'])
        expect(edgeSummaries(result)).toContainEqual(['root', 'MASK_IMAGE', 'projects/p/assets/mask'])
        expect(edgeSummaries(result)).toContainEqual(['nested', 'PRIMARY_IMAGE', 'projects/p/assets/inner'])
    })

    // The edge is real - the user selected it - so it stays. What must not happen is descending into it.
    it('reports a recipe that references itself and settles', () => {
        const result = graph(masking('root', {imageToMask: recipeRef('root')}))
        expect(recipeIds(result)).toEqual(['root'])
        expect(edgeSummaries(result)).toEqual([['root', 'PRIMARY_IMAGE', 'root']])
        expect(result.diagnostics).toEqual([
            {
                code: 'CYCLIC_DEPENDENCY',
                role: 'PRIMARY_IMAGE',
                path: ['model', 'imageToMask'],
                recipePath: ['root', 'root']
            }
        ])
    })

    // The path is the whole diagnosis: "root depends on itself" is not actionable, and "root -> child -> root"
    // names the edge a user has to break.
    it('reports an indirect cycle with the path that closes it', () => {
        const result = graph(
            masking('root', {imageToMask: recipeRef('child')}),
            [masking('child', {imageToMask: recipeRef('root')})]
        )
        expect(recipeIds(result)).toEqual(['root', 'child'])
        expect(edgeSummaries(result)).toEqual([
            ['root', 'PRIMARY_IMAGE', 'child'],
            ['child', 'PRIMARY_IMAGE', 'root']
        ])
        expect(result.diagnostics).toEqual([
            {
                code: 'CYCLIC_DEPENDENCY',
                role: 'PRIMARY_IMAGE',
                path: ['model', 'imageToMask'],
                recipePath: ['root', 'child', 'root']
            }
        ])
    })

    // A dependency that is gone is the case the graph exists to make loud. Silently omitting it would leave a
    // recipe that looks complete and cannot run.
    it('reports a referenced recipe that is not present', () => {
        const result = graph(masking('root', {imageToMask: recipeRef('gone'), imageMask: assetRef('projects/p/assets/mask')}))
        expect(recipeIds(result)).toEqual(['root'])
        expect(edgeSummaries(result)).toContainEqual(['root', 'PRIMARY_IMAGE', 'gone'])
        expect(result.diagnostics).toEqual([
            {
                code: 'MISSING_SOURCE',
                role: 'PRIMARY_IMAGE',
                path: ['model', 'imageToMask'],
                recipePath: ['root', 'gone']
            }
        ])
    })

    // One unavailable node, not one per reference to it: a user restores or reselects it once, so repeating the
    // diagnosis per referring edge would multiply one problem by how popular the missing recipe was.
    it('reports an absent recipe once no matter how many edges reach it', () => {
        const result = graph(
            masking('root', {imageToMask: recipeRef('left'), imageMask: recipeRef('right')}),
            [
                masking('left', {imageToMask: recipeRef('gone')}),
                masking('right', {imageToMask: recipeRef('gone')})
            ]
        )
        expect(edgeSummaries(result)).toEqual([
            ['root', 'PRIMARY_IMAGE', 'left'],
            ['root', 'MASK_IMAGE', 'right'],
            ['left', 'PRIMARY_IMAGE', 'gone'],
            ['right', 'PRIMARY_IMAGE', 'gone']
        ])
        expect(result.diagnostics).toEqual([
            {
                code: 'MISSING_SOURCE',
                role: 'PRIMARY_IMAGE',
                path: ['model', 'imageToMask'],
                recipePath: ['root', 'left', 'gone']
            }
        ])
    })

    // The counterpart, and the reason the two are deduplicated differently: a cycle is a property of one edge
    // on one path, not of the recipe it returns to. Two closing edges are two different selections a user has
    // to change, in two different recipes, and collapsing them to one would hide the second.
    it('reports every edge that closes a cycle, not every recipe a cycle returns to', () => {
        const result = graph(
            masking('root', {imageToMask: recipeRef('child'), imageMask: recipeRef('other')}),
            [
                masking('child', {imageToMask: recipeRef('root')}),
                masking('other', {imageMask: recipeRef('root')})
            ]
        )
        expect(recipeIds(result)).toEqual(['root', 'child', 'other'])
        expect(edgeSummaries(result)).toEqual([
            ['root', 'PRIMARY_IMAGE', 'child'],
            ['root', 'MASK_IMAGE', 'other'],
            ['child', 'PRIMARY_IMAGE', 'root'],
            ['other', 'MASK_IMAGE', 'root']
        ])
        expect(result.diagnostics).toEqual([
            {
                code: 'CYCLIC_DEPENDENCY',
                role: 'PRIMARY_IMAGE',
                path: ['model', 'imageToMask'],
                recipePath: ['root', 'child', 'root']
            },
            {
                code: 'CYCLIC_DEPENDENCY',
                role: 'MASK_IMAGE',
                path: ['model', 'imageMask'],
                recipePath: ['root', 'other', 'root']
            }
        ])
    })

    // A broken reference deep in the graph has to name the recipe it is in, or a user is told a path is broken
    // without being told where. Its siblings are unaffected and must still be followed.
    it('carries a nested recipe declaration diagnosis with the path to that recipe', () => {
        const result = graph(
            masking('root', {imageToMask: recipeRef('nested')}),
            [
                masking('nested', {imageToMask: {type: 'RECIPE_REF'}, imageMask: recipeRef('deep')}),
                slice('deep', assetRef('projects/p/assets/segments'))
            ]
        )
        expect(recipeIds(result)).toEqual(['root', 'nested', 'deep'])
        expect(result.diagnostics).toEqual([
            {
                code: 'INCOMPLETE_REFERENCE',
                role: 'PRIMARY_IMAGE',
                path: ['model', 'imageToMask'],
                recipePath: ['root', 'nested']
            }
        ])
        expect(edgeSummaries(result)).toContainEqual(['nested', 'MASK_IMAGE', 'deep'])
    })

    // A type with no shared definition is reached, not skipped: the record exists, and answering with an empty
    // edge list would read as a recipe that genuinely has no dependencies.
    it('includes a reached recipe whose type has no definition and reports it', () => {
        const result = graph(
            masking('root', {imageToMask: recipeRef('retired')}),
            [{id: 'retired', type: 'RETIRED_RECIPE', model: {aoi: {type: 'RECIPE', id: 'aoi-recipe-1'}}}]
        )
        expect(recipeIds(result)).toEqual(['root', 'retired'])
        expect(result.diagnostics).toEqual([
            {code: 'UNSUPPORTED_RECIPE_TYPE', path: [], recipePath: ['root', 'retired']}
        ])
    })

    // Two builds of one graph must be interchangeable, and neither may leave a mark on what it was given: the
    // records belong to a catalogue that other consumers hold at the same time.
    it('is deterministic and leaves its inputs unchanged', () => {
        const rootRecipe = masking('root', {imageToMask: recipeRef('left'), imageMask: recipeRef('right')})
        const records = [
            masking('left', {imageToMask: recipeRef('shared')}),
            masking('right', {imageToMask: recipeRef('shared')}),
            slice('shared', assetRef('projects/p/assets/segments'))
        ]
        const recipesById = new Map(records.map(record => [record.id, record]))
        const before = JSON.stringify({rootRecipe, records})

        const first = buildRecipeDependencyGraph({rootRecipe, recipesById})
        const second = buildRecipeDependencyGraph({rootRecipe, recipesById})

        expect(second).toEqual(first)
        expect(JSON.stringify({rootRecipe, records})).toEqual(before)
        expect([...recipesById.keys()]).toEqual(['left', 'right', 'shared'])
    })
})
