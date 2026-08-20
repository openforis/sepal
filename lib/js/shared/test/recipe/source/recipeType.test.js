import {defineRecipeType} from '#sepal/recipe/defineRecipeType'
import {createRecipeTypeRegistry} from '#sepal/recipe/recipeTypeRegistry'

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

    it('indexes definitions by their persisted type', () => {
        const registry = createRecipeTypeRegistry([definition(), definition({type: 'CCDC_SLICE'})])
        expect(registry.get('CCDC_SLICE').type).toBe('CCDC_SLICE')
        expect(registry.has('NOT_DEFINED')).toBe(false)
    })
})
