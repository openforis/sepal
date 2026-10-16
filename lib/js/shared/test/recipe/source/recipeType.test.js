import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {defineRecipeType} from '#sepal/recipe/defineRecipeType'
import {mapProduct} from '#sepal/recipe/output/product'
import {imageOutputProvider, NO_IMAGE_OUTPUT, preservingProvider} from '#sepal/recipe/output/provider'
import {createRecipeTypeRegistry, isSupportedRecipeType, recipeTypes} from '#sepal/recipe/recipeTypeRegistry'

const DESCRIBED = imageOutputProvider({describe: () => ({bands: [], evidence: []})})

const definition = overrides => defineRecipeType({type: 'CCDC', directSources: () => [], imageOutput: DESCRIBED, ...overrides})

describe('defineRecipeType', () => {
    // The persisted type is how a saved recipe finds its definition. Without one the definition can be
    // registered and never reached, which reads as a recipe type nobody has defined.
    it('rejects a definition with no persisted type', () => {
        assert.throws(
            () => defineRecipeType({directSources: () => []}),
            /non-blank persisted type/
        )
        assert.throws(() => defineRecipeType(), /non-blank persisted type/)
    })

    it('rejects a blank persisted type', () => {
        assert.throws(
            () => defineRecipeType({type: '  ', directSources: () => []}),
            /non-blank persisted type/
        )
    })

    // Failing closed here is the point: a definition that forgot to declare its sources would otherwise
    // answer every question about that recipe type with an empty dependency list.
    it('rejects a definition that does not declare directSources', () => {
        assert.throws(() => defineRecipeType({type: 'CCDC'}), /must declare directSources/)
        assert.throws(
            () => defineRecipeType({type: 'CCDC', directSources: []}),
            /must declare directSources/
        )
    })

    // The escape hatch has to stay open, or a genuinely dependency-free recipe type could not be defined at
    // all - and someone would reopen the hole above to define it.
    it('accepts a type that declares it has no sources', () => {
        assert.deepEqual(
            defineRecipeType({type: 'NO_SOURCES', directSources: () => [], imageOutput: DESCRIBED}).directSources({}),
            []
        )
    })

    // The definition is the only place a recipe type's output behavior may be stated, so the definition has
    // to survive being defined. Retaining it is the whole point of declaring it.
    it('retains a valid output declaration', () => {
        const imageOutput = imageOutputProvider({describe: () => ({bands: [], evidence: []})})
        assert.deepEqual(definition({imageOutput}).imageOutput, imageOutput)
    })

    // A type whose recipes produce no image says so, and keeps saying so: it is not a provider of no bands.
    it('retains a statement that the type has no image output', () => {
        assert.equal(definition({imageOutput: NO_IMAGE_OUTPUT}).imageOutput, NO_IMAGE_OUTPUT)
    })

    it('rejects a look-alike of that statement, which is no provider either', () => {
        assert.throws(() => definition({imageOutput: {kind: 'NONE'}}), /describe/)
    })

    // Every type states what it outputs, as it states its sources: saying nothing is a definition mistake, not a
    // type whose output is unknown.
    it('rejects a definition that states no image output', () => {
        assert.throws(
            () => definition({imageOutput: undefined}),
            /CCDC must declare its imageOutput/
        )
        assert.throws(
            () => createRecipeTypeRegistry([{type: 'IMPORTED', directSources: () => []}]),
            /IMPORTED must declare its imageOutput/
        )
    })

    it('rejects a provider with no describe function', () => {
        assert.throws(() => definition({imageOutput: {}}), /describe/)
        assert.throws(() => definition({imageOutput: {describe: 'bands'}}), /describe/)
        assert.throws(() => definition({imageOutput: () => ({})}), /describe/)
    })

    it('rejects a provider with a malformed role or effects without a role', () => {
        assert.throws(() => definition({imageOutput: {role: '', describe: () => ({})}}), /role/)
        assert.throws(
            () => definition({imageOutput: {effects: {}, describe: () => ({})}}),
            /role/
        )
    })

    it('accepts a provider with and without a declared role', () => {
        const valid = [
            imageOutputProvider({describe: () => ({bands: [], evidence: []})}),
            preservingProvider({role: 'image'})
        ]
        valid.forEach(imageOutput => assert.deepEqual(definition({imageOutput}).imageOutput, imageOutput))
    })
})

describe('recipeTypeRegistry', () => {
    // Two definitions for one persisted type means one of them silently never runs, and which one depends
    // on import order.
    it('rejects two definitions for the same persisted type', () => {
        assert.throws(
            () => createRecipeTypeRegistry([definition(), definition()]),
            /Duplicate recipe type definition: CCDC/
        )
    })

    // Nothing in plain JavaScript makes a module call defineRecipeType(). A definition that skipped it, or
    // lost a field in an edit, would be indexed happily and fail later as an incidental TypeError inside
    // whatever asked for its sources.
    it('rejects an imported definition that never went through defineRecipeType', () => {
        assert.throws(
            () => createRecipeTypeRegistry([{type: 'BROKEN'}]),
            /must declare directSources/
        )
        assert.throws(
            () => createRecipeTypeRegistry([{directSources: () => []}]),
            /non-blank persisted type/
        )
    })

    // Being imported here is what makes a definition reachable, so the registry re-checks the output
    // declaration for the same reason it re-checks the rest: nothing makes a module call defineRecipeType().
    it('rejects an imported definition whose output declaration is malformed', () => {
        assert.throws(() => createRecipeTypeRegistry([{
            type: 'BROKEN_OUTPUT',
            directSources: () => [],
            imageOutput: {role: 'image', transform: () => ({})}
        }]), /describe/)
    })

    // A delegating product is described by another type's declaration, so the registry is where that type is known.
    describe('a map product delegating to another type', () => {
        const delegating = definition({
            type: 'LANDTRENDR',
            mapProducts: {ANNUAL_MOSAIC: mapProduct({delegatesTo: 'MOSAIC', describe: () => ({})})}
        })
        const mosaic = imageOutput => definition({type: 'MOSAIC', imageOutput})

        it('is accepted wherever its delegate is listed', () => {
            const declared = mosaic(imageOutputProvider({describe: () => ({bands: [], evidence: []})}))

            assert.equal(createRecipeTypeRegistry([delegating, declared]).has('LANDTRENDR'), true)
            assert.equal(createRecipeTypeRegistry([declared, delegating]).has('LANDTRENDR'), true)
        })

        for (const [scenario, definitions, reason] of [
            ['a type nothing registers', [delegating], /MOSAIC, which declares no image output/],
            ['a type whose output reads its role', [delegating, mosaic(preservingProvider({role: 'image'}))], /reads its image source/],
            ['a type stating it has no image output', [delegating, mosaic(NO_IMAGE_OUTPUT)], /MOSAIC, which declares no image output/]
        ]) {
            it(`is refused for ${scenario}`, () => {
                assert.throws(() => createRecipeTypeRegistry(definitions), reason)
            })
        }
    })

    // Every type a product lists is one it may be described by, so each is held to the same terms.
    describe('a map product delegating to any of several types', () => {
        const delegating = definition({
            type: 'CHANGE_ALERTS',
            mapProducts: {COLLECTION_MOSAIC: mapProduct({delegatesTo: ['MOSAIC', 'RADAR_MOSAIC'], describe: () => ({})})}
        })
        const declaring = type => definition({type, imageOutput: imageOutputProvider({describe: () => ({bands: [], evidence: []})})})

        it('is accepted where every listed type is', () => {
            assert.equal(
                createRecipeTypeRegistry([declaring('RADAR_MOSAIC'), delegating, declaring('MOSAIC')]).has('CHANGE_ALERTS'),
                true
            )
        })

        for (const [scenario, definitions, reason] of [
            ['one of them nothing registers', [delegating, declaring('MOSAIC')], /RADAR_MOSAIC, which declares no image output/],
            ['one of them producing no image', [delegating, declaring('MOSAIC'), definition({type: 'RADAR_MOSAIC', imageOutput: NO_IMAGE_OUTPUT})], /RADAR_MOSAIC, which declares no image output/],
            ['one of them reading its role', [delegating, declaring('RADAR_MOSAIC'), definition({type: 'MOSAIC', imageOutput: preservingProvider({role: 'image'})})], /MOSAIC, whose output reads its image source/]
        ]) {
            it(`is refused where ${scenario}`, () => {
                assert.throws(() => createRecipeTypeRegistry(definitions), reason)
            })
        }
    })

    it('indexes definitions by their persisted type', () => {
        const registry = createRecipeTypeRegistry([definition(), definition({type: 'CCDC_SLICE'})])
        assert.equal(registry.get('CCDC_SLICE').type, 'CCDC_SLICE')
        assert.equal(registry.has('NOT_DEFINED'), false)
    })
})

describe('the registered recipe types', () => {
    // Registration is what makes a definition reachable. A definition file that exists but was never
    // imported here answers every question about its type with UNSUPPORTED_RECIPE_TYPE.
    it('includes MASKING', () => {
        assert.equal(isSupportedRecipeType('MASKING'), true)
    })

    // Registration refuses a type stating no output; this names which types produce no image, so one cannot become
    // such a type, or stop being one, without being seen.
    it('include only a Sampling Design stating it produces no image', () => {
        const nonImage = recipeTypes().filter(({imageOutput}) => imageOutput === NO_IMAGE_OUTPUT)

        assert.deepEqual(nonImage.map(({type}) => type), ['SAMPLING_DESIGN'])
    })
})
