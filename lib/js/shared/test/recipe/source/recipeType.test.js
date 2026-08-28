import {defineRecipeType} from '#sepal/recipe/defineRecipeType'
import {intrinsicImageOutput, naryTransformation, oneInputTransformation} from '#sepal/recipe/output/transformation'
import {createRecipeTypeRegistry, isSupportedRecipeType} from '#sepal/recipe/recipeTypeRegistry'

const definition = overrides => defineRecipeType({type: 'CCDC', directSources: () => [], ...overrides})

describe('defineRecipeType', () => {
    // The persisted type is how a saved recipe finds its definition. Without one the definition can be
    // registered and never reached, which reads as a recipe type nobody has defined.
    it('rejects a definition with no persisted type', () => {
        expect(() => defineRecipeType({directSources: () => []})).toThrow(/non-blank persisted type/)
        expect(() => defineRecipeType()).toThrow(/non-blank persisted type/)
    })

    it('rejects a blank persisted type', () => {
        expect(() => defineRecipeType({type: '  ', directSources: () => []})).toThrow(/non-blank persisted type/)
    })

    // Failing closed here is the point: a definition that forgot to declare its sources would otherwise
    // answer every question about that recipe type with an empty dependency list.
    it('rejects a definition that does not declare directSources', () => {
        expect(() => defineRecipeType({type: 'CCDC'})).toThrow(/must declare directSources/)
        expect(() => defineRecipeType({type: 'CCDC', directSources: []})).toThrow(/must declare directSources/)
    })

    // The escape hatch has to stay open, or a genuinely dependency-free recipe type could not be defined at
    // all - and someone would reopen the hole above to define it.
    it('accepts a type that declares it has no sources', () => {
        expect(defineRecipeType({type: 'NO_SOURCES', directSources: () => []}).directSources({})).toEqual([])
    })

    // The definition is the only place a recipe type's output behavior may be stated, so the definition has
    // to survive being defined. Retaining it is the whole point of declaring it.
    it('retains a valid output declaration', () => {
        const imageOutput = intrinsicImageOutput({derive: () => ({bands: [], evidence: []})})
        expect(definition({imageOutput}).imageOutput).toEqual(imageOutput)
    })

    // Most recipe types have not been migrated. Not declaring an output must stay distinguishable from
    // declaring one, rather than becoming a key that is present and empty.
    it('leaves a definition with no output declaration without one', () => {
        const defined = definition()
        expect(defined.imageOutput).toBeUndefined()
        expect('imageOutput' in defined).toBe(false)
    })

    it('rejects a malformed intrinsic output declaration', () => {
        expect(() => definition({imageOutput: {kind: 'INTRINSIC'}})).toThrow(/derive/)
        expect(() => definition({imageOutput: {kind: 'INTRINSIC', derive: 'bands'}})).toThrow(/derive/)
    })

    it('rejects a malformed one-input output declaration', () => {
        expect(() => definition({imageOutput: {kind: 'ONE_INPUT', transform: () => ({})}})).toThrow(/role/)
        expect(() => definition({imageOutput: {kind: 'ONE_INPUT', role: 'image'}})).toThrow(/transform/)
    })

    it('rejects a malformed n-ary output declaration', () => {
        expect(() => definition({imageOutput: {kind: 'N_ARY'}})).toThrow(/transform/)
    })

    // A declaration of an unrecognized kind reaches the resolver's n-ary branch by default, where it would
    // be handed every edge of the recipe rather than reported.
    it('rejects an output declaration of an unknown kind', () => {
        expect(() => definition({imageOutput: {transform: () => ({})}})).toThrow(/kind/)
        expect(() => definition({imageOutput: {kind: 'PASSTHROUGH', transform: () => ({})}})).toThrow(/kind/)
        expect(() => definition({imageOutput: () => ({})})).toThrow(/kind/)
    })

    it('accepts each valid declaration kind', () => {
        const valid = [
            intrinsicImageOutput({derive: () => ({bands: [], evidence: []})}),
            oneInputTransformation({role: 'image', transform: () => ({bands: [], evidence: []})}),
            naryTransformation({transform: () => ({bands: [], evidence: []})})
        ]
        valid.forEach(imageOutput => expect(definition({imageOutput}).imageOutput).toEqual(imageOutput))
    })
})

describe('recipeTypeRegistry', () => {
    // Two definitions for one persisted type means one of them silently never runs, and which one depends
    // on import order.
    it('rejects two definitions for the same persisted type', () => {
        expect(() => createRecipeTypeRegistry([definition(), definition()]))
            .toThrow(/Duplicate recipe type definition: CCDC/)
    })

    // Nothing in plain JavaScript makes a module call defineRecipeType(). A definition that skipped it, or
    // lost a field in an edit, would be indexed happily and fail later as an incidental TypeError inside
    // whatever asked for its sources.
    it('rejects an imported definition that never went through defineRecipeType', () => {
        expect(() => createRecipeTypeRegistry([{type: 'BROKEN'}])).toThrow(/must declare directSources/)
        expect(() => createRecipeTypeRegistry([{directSources: () => []}])).toThrow(/non-blank persisted type/)
    })

    // Being imported here is what makes a definition reachable, so the registry re-checks the output
    // declaration for the same reason it re-checks the rest: nothing makes a module call defineRecipeType().
    it('rejects an imported definition whose output declaration is malformed', () => {
        expect(() => createRecipeTypeRegistry([{
            type: 'BROKEN_OUTPUT',
            directSources: () => [],
            imageOutput: {kind: 'INTRINSIC'}
        }])).toThrow(/derive/)
        expect(() => createRecipeTypeRegistry([{
            type: 'BROKEN_OUTPUT',
            directSources: () => [],
            imageOutput: {role: 'image', transform: () => ({})}
        }])).toThrow(/kind/)
    })

    it('indexes definitions by their persisted type', () => {
        const registry = createRecipeTypeRegistry([definition(), definition({type: 'CCDC_SLICE'})])
        expect(registry.get('CCDC_SLICE').type).toBe('CCDC_SLICE')
        expect(registry.has('NOT_DEFINED')).toBe(false)
    })
})

describe('the registered recipe types', () => {
    // Registration is what makes a definition reachable. A definition file that exists but was never
    // imported here answers every question about its type with UNSUPPORTED_RECIPE_TYPE.
    it('includes MASKING', () => {
        expect(isSupportedRecipeType('MASKING')).toBe(true)
    })
})
