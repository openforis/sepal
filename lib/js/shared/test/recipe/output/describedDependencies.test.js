import {imageOutputProvider, preservingProvider} from '#sepal/recipe/output/provider'
import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {dependencyValidity} from '#sepal/recipe/source/dependencyValidity'

// Which dependencies a description depends on, over graphs the real builder produces. Real Masking records supply
// the structure, because what is under test is how resolution meets the order the builder happened to walk in;
// small providers, chosen per recipe, decide what each description reads.
//
// Codes and statuses are asserted as literals, so a production rename cannot pass unnoticed.

describe('a description whose reads form no cycle', () => {
    // R reads B, B reads A, and A describes itself. The graph also holds A -> B and R -> A, which close a
    // cycle nothing reads. Which of A -> B or B -> A the builder marks depends only on which of R's edges
    // it follows first.
    const firstA = () => [
        masking('R', {primary: 'A', mask: 'B'}),
        masking('A', {primary: 'B'}),
        masking('B', {primary: 'A'})
    ]
    const firstB = () => [
        masking('R', {primary: 'B', mask: 'A'}),
        masking('A', {primary: 'B'}),
        masking('B', {primary: 'A'})
    ]
    const providers = rRole => ({R: reading(rRole), B: reading('PRIMARY_IMAGE'), A: configured(['a'])})

    it.each([
        ['A first, marking B -> A', firstA, 'MASK_IMAGE'],
        ['B first, marking A -> B', firstB, 'PRIMARY_IMAGE']
    ])('resolves whichever edge the graph marks as closing its cycle (%s)', (_order, records, rRole) => {
        const graph = graphOf(records())

        expect(graph.diagnostics.map(({code}) => code)).toEqual(['CYCLIC_DEPENDENCY'])
        expect(resolve(graph, providers(rRole))).toEqual(describedAs('R', ['a']))
    })

    it.each([
        ['A first', firstA, 'MASK_IMAGE'],
        ['B first', firstB, 'PRIMARY_IMAGE']
    ])('leaves the cycle in the dependencies it does not read, whatever the order (%s)', (_order, records) => {
        expect(dependencyValidity({status: 'COMPLETE', graph: graphOf(records())}).status).toBe('INVALID')
    })

    it.each([
        ['A first', firstA, 'MASK_IMAGE'],
        ['B first', firstB, 'PRIMARY_IMAGE']
    ])('fails in either order once the reads themselves form the cycle (%s)', (_order, records, rRole) => {
        const result = resolve(graphOf(records()), {...providers(rRole), A: reading('PRIMARY_IMAGE')})

        expect(result.description).toBeNull()
        expect(result.diagnostics.map(({code}) => code)).toEqual(['CYCLIC_DEPENDENCY'])
    })
})

// A diamond is two routes to one recipe, not a cycle.
it('describes a shared dependency once, whichever route reaches it first', () => {
    const records = [
        masking('R', {primary: 'L', mask: 'M'}),
        masking('L', {primary: 'S'}),
        masking('M', {primary: 'S'}),
        masking('S')
    ]
    const described = []
    const graph = graphOf(records)

    const result = resolve(graph, {
        R: combining(),
        L: reading('PRIMARY_IMAGE'),
        M: reading('PRIMARY_IMAGE'),
        S: imageOutputProvider({describe: () => (described.push('S'), bands(['s']))})
    })

    expect(graph.diagnostics).toEqual([])
    expect(result).toEqual(describedAs('R', ['PRIMARY_IMAGE0_s', 'MASK_IMAGE1_s']))
    expect(described).toEqual(['S'])
})

// The graph reports an absent recipe once, on whichever edge reached it first. Every edge into it still fails a
// description that reads it.
describe('a missing recipe reached by more than one edge', () => {
    const records = () => [
        masking('R', {primary: 'L', mask: 'gone'}),
        masking('L', {primary: 'gone'})
    ]

    it('fails a description reading it through an edge the graph did not report it on', () => {
        const graph = graphOf(records())

        expect(graph.diagnostics).toEqual([
            {code: 'MISSING_SOURCE', role: 'PRIMARY_IMAGE', path: ['model', 'imageToMask'], recipePath: ['R', 'L', 'gone']}
        ])
        expect(resolve(graph, {R: reading('MASK_IMAGE')})).toEqual({
            description: null,
            diagnostics: [
                {code: 'MISSING_SOURCE', role: 'MASK_IMAGE', path: ['model', 'imageMask'], recipePath: ['R', 'gone']}
            ]
        })
    })

    it('does not fail a description that reads neither edge', () => {
        expect(resolve(graphOf(records()), {R: configured(['r'])})).toEqual(describedAs('R', ['r']))
    })
})

// Observing a recipe may consult anything it depends on, so a structural diagnosis anywhere below it withholds
// the request. What lies below is found by what owns each diagnosis, not by the path the graph recorded - which
// names whichever branch arrived first.
describe('the conservative check before a recipe is observed', () => {
    it('finds a missing recipe first reported through another branch', () => {
        const graph = graphOf([
            masking('R', {primary: 'L', mask: 'O'}),
            masking('L', {primary: 'gone'}),
            masking('O', {primary: 'gone'})
        ])
        const requested = []

        const result = resolve(graph, {R: reading('MASK_IMAGE'), O: observing()}, requested)

        expect(graph.diagnostics.map(({recipePath}) => recipePath)).toEqual([['R', 'L', 'gone']])
        expect(result.diagnostics).toEqual([
            {code: 'MISSING_SOURCE', role: 'PRIMARY_IMAGE', path: ['model', 'imageToMask'], recipePath: ['R', 'O', 'gone']}
        ])
        expect(requested).toEqual([])
    })

    it('finds a cycle below it whose closing edge the graph recorded on another path', () => {
        const graph = graphOf([
            masking('R', {primary: 'A', mask: 'O'}),
            masking('A', {primary: 'B'}),
            masking('B', {primary: 'A'}),
            masking('O', {primary: 'B'})
        ])
        const requested = []

        const result = resolve(graph, {R: reading('MASK_IMAGE'), O: observing()}, requested)

        expect(graph.diagnostics.map(({recipePath}) => recipePath)).toEqual([['R', 'A', 'B', 'A']])
        expect(result.diagnostics.map(({code}) => code)).toEqual(['CYCLIC_DEPENDENCY'])
        expect(requested).toEqual([])
    })

    it('observes a recipe whose dependencies are sound', () => {
        const graph = graphOf([
            masking('R', {primary: 'O', mask: 'gone'}),
            masking('O', {primary: 'S'}),
            masking('S')
        ])
        const requested = []

        const result = resolve(graph, {R: reading('PRIMARY_IMAGE'), O: observing()}, requested)

        expect(result).toEqual(describedAs('R', ['observed']))
        expect(requested).toEqual(['O'])
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

const bands = names => ({bands: names.map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'})), evidence: []})

const configured = names => imageOutputProvider({describe: () => bands(names)})

const reading = role => preservingProvider({role})

const observing = () => imageOutputProvider({describe: ({observation}) => observation()})

const combining = () => imageOutputProvider({
    describe: ({inputs}) => {
        const all = inputs()
        return all && bands(all.flatMap(({role, description}, index) =>
            description.output.bands.map(({name}) => `${role}${index}_${name}`)
        ))
    }
})

const resolve = (graph, providers, requested = []) => resolveImageOutput({
    graph,
    declarationFor: ({id}) => providers[id],
    observationFor: ({id}) => (requested.push(id), bands(['observed']))
})

const describedAs = (id, names) => ({
    description: {
        executionReference: {type: 'RECIPE_REF', id},
        output: {kind: 'IMAGE', bands: names.map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}))},
        evidence: []
    },
    diagnostics: []
})
