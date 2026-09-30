import {imageOutputProvider, NO_IMAGE_OUTPUT, preservingProvider} from '#sepal/recipe/output/provider'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// What can be said about a recipe's output from what is held right now - records and observations - without
// acquiring anything. Real Masking records supply the structure; small providers, chosen per recipe, decide
// what each description reads. Statuses and codes are literals, so a production rename cannot pass unnoticed.

describe('an answer from what is held', () => {
    it('is ready when every read is satisfied, needing nothing', () => {
        const result = read(graphOf([masking('R', {primary: 'S'}), masking('S')]), {R: reading('PRIMARY_IMAGE'), S: configured(['s'])})

        expect(result).toEqual({status: 'READY', description: describedAs('R', ['s']), diagnostics: [], needs: NOTHING})
    })

    it('is ready with no bands when the configured output legitimately has none', () => {
        const result = read(graphOf([masking('R')]), {R: configured([])})

        expect(result.status).toBe('READY')
        expect(result.description.output.bands).toEqual([])
    })

    it('is ready when a recipe it does not read is not held', () => {
        const result = read(graphOf([masking('R', {primary: 'S', mask: 'unloaded'}), masking('S')]), {
            R: reading('PRIMARY_IMAGE'),
            S: configured(['s'])
        })

        expect(result.status).toBe('READY')
    })
})

describe('an answer that needs evidence', () => {
    it('names a recipe it reads that is not held', () => {
        const result = read(graphOf([masking('R', {primary: 'unloaded'})]), {R: reading('PRIMARY_IMAGE')})

        expect(result.status).toBe('NEEDS_EVIDENCE')
        expect(result.needs).toEqual({records: ['unloaded'], observations: []})
        expect(result.description).toBeNull()
    })

    it('names each observation it asked for that is not held, once however often it was asked', () => {
        const result = read(graphOf([
            masking('R', {primary: 'L', mask: 'M'}),
            masking('L', {primary: 'O'}),
            masking('M', {primary: 'O'}),
            masking('O')
        ]), {R: combining(), L: reading('PRIMARY_IMAGE'), M: reading('PRIMARY_IMAGE'), O: observing()})

        expect(result.status).toBe('NEEDS_EVIDENCE')
        expect(result.needs).toEqual({records: [], observations: [{type: 'RECIPE_REF', id: 'O'}]})
    })

    it('is answered by the observation once it is held', () => {
        const graph = graphOf([masking('R', {primary: 'O'}), masking('O')])
        const providers = {R: reading('PRIMARY_IMAGE'), O: observing()}

        const result = read(graph, providers, {'RECIPE_REF:O': bands(['observed'])})

        expect(result.status).toBe('READY')
        expect(result.description.output.bands.map(({name}) => name)).toEqual(['observed'])
    })

    it('still needs a missing recipe beside a declaration that is not there, which only loading can settle', () => {
        const result = read(graphOf([masking('R', {primary: 'U', mask: 'unloaded'}), masking('U')]), {R: combining()})

        expect(result.status).toBe('NEEDS_EVIDENCE')
        expect(result.diagnostics.map(({code}) => code)).toEqual(['UNDECLARED_OUTPUT', 'MISSING_SOURCE'])
    })
})

describe('an answer no evidence can repair', () => {
    it('is invalid for a definitive diagnosis on the read path, even beside evidence it still needs', () => {
        const result = read(graphOf([
            masking('R', {primary: 'A', mask: 'unloaded'}),
            masking('A', {primary: 'R'})
        ]), {R: combining(), A: reading('PRIMARY_IMAGE')})

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics.map(({code}) => code)).toEqual(['CYCLIC_DEPENDENCY', 'MISSING_SOURCE'])
        expect(result.needs).toEqual({records: ['unloaded'], observations: []})
    })

    it('is invalid for a provider\'s refusal, even beside an observation it still needs', () => {
        const result = read(graphOf([masking('R', {primary: 'O'}), masking('O')]), {R: reading('PRIMARY_IMAGE'), O: refusingAfterObserving()})

        expect(result).toEqual({
            status: 'INVALID',
            description: null,
            diagnostics: [
                {code: 'UNAVAILABLE_DESCRIPTION', path: [], recipePath: ['R', 'O'], reference: {type: 'RECIPE_REF', id: 'O'}},
                {code: 'SYNTHETIC_CONFLICT', path: ['model'], recipePath: ['R', 'O']}
            ],
            needs: {records: [], observations: [{type: 'RECIPE_REF', id: 'O'}]}
        })
    })

    it('is invalid for a recipe with no image output, even beside a recipe still to be loaded', () => {
        const result = read(graphOf([masking('R', {primary: 'N', mask: 'unloaded'}), masking('N')]), {R: combining(), N: NO_IMAGE_OUTPUT})

        expect(result).toEqual({
            status: 'INVALID',
            description: null,
            diagnostics: [
                {code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['R', 'N']},
                expect.objectContaining({code: 'MISSING_SOURCE'})
            ],
            needs: {records: ['unloaded'], observations: []}
        })
    })

    it('is invalid for an output nothing declares, which no held evidence would describe', () => {
        const result = read(graphOf([masking('R')]), {})

        expect(result).toEqual({
            status: 'INVALID',
            description: null,
            diagnostics: [{code: 'UNDECLARED_OUTPUT', path: [], recipePath: ['R']}],
            needs: NOTHING
        })
    })
})

const NOTHING = {records: [], observations: []}

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

const bands = names => ({bands: names.map(name => ({name, pyramidingPolicy: 'mean'})), evidence: []})

const configured = names => imageOutputProvider({describe: () => bands(names)})

const reading = role => preservingProvider({role})

const observing = () => imageOutputProvider({describe: ({observation}) => observation()})

const refusingAfterObserving = () => imageOutputProvider({
    describe: ({observation}) => {
        observation()
        return {diagnostics: [{code: 'SYNTHETIC_CONFLICT', path: ['model']}]}
    }
})

const combining = () => imageOutputProvider({
    describe: ({inputs}) => {
        const all = inputs()
        return all && bands(all.flatMap(({description}) => description.output.bands.map(({name}) => name)))
    }
})

const read = (graph, providers, observations = {}) => readImageOutput({
    graph,
    declarationFor: ({id}) => providers[id],
    observationFor: ({type, id}) => observations[`${type}:${id}`]
})

const describedAs = (id, names) => ({
    executionReference: {type: 'RECIPE_REF', id},
    output: {kind: 'IMAGE', bands: names.map(name => ({name, pyramidingPolicy: 'mean'}))},
    evidence: []
})
