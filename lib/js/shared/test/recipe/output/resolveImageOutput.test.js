import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {
    AVAILABLE_BANDS,
    IDENTITY,
    imageOutputProvider,
    inheritedSchemaRole,
    NARROWED,
    NO_IMAGE_OUTPUT,
    PRESERVED,
    preservingProvider
} from '#sepal/recipe/output/provider'
import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'

// Diagnostic codes are asserted as literals throughout. Importing the constants would let production and
// these tests rename together and stay green, and this suite is where their external meaning is defined.

const recipeReference = id => ({type: 'RECIPE_REF', id})
const assetReference = id => ({type: 'ASSET', id})
const band = (name, pyramidingPolicy) => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy})
const edge = (sourceRecipeId, role, reference, diagnostic) =>
    ({sourceRecipeId, role, reference, path: ['model', role], ...(diagnostic && {diagnostic})})

// Graphs are written out rather than built, so each shape - and in particular the root-first order of
// `recipes` - is visible in the test that depends on it.
const graph = ({recipes, edges = [], diagnostics = [], recipeDiagnostics = new Map()}) =>
    ({recipes, edges, diagnostics, recipeDiagnostics})
const node = (id, type, configuredBands) => ({id, type, ...(configuredBands && {configuredBands})})

// Synthetic types only: no real recipe type is activated, and nothing is registered anywhere.
const OBSERVED = 'SYNTHETIC_OBSERVED'
const CONFIGURED = 'SYNTHETIC_CONFIGURED'
const PASS_THROUGH = 'SYNTHETIC_PASS_THROUGH'
const CHANGING = 'SYNTHETIC_CHANGING'
const COMBINE = 'SYNTHETIC_COMBINE'
const REORDER = 'SYNTHETIC_REORDER'
const PARTIAL = 'SYNTHETIC_PARTIAL'
const UNDECLARED = 'SYNTHETIC_UNDECLARED'
const REFUSING = 'SYNTHETIC_REFUSING'
const OBSERVING_REFUSAL = 'SYNTHETIC_OBSERVING_REFUSAL'
const NON_IMAGE = 'SYNTHETIC_NON_IMAGE'
const ESTABLISHING = 'SYNTHETIC_ESTABLISHING'

const declarations = {
    // States that its recipes produce no image at all.
    [NON_IMAGE]: NO_IMAGE_OUTPUT,
    // Asks only which bands it can be asked for, and establishes their shape from its own declaration.
    [ESTABLISHING]: imageOutputProvider({
        observes: AVAILABLE_BANDS,
        describe: ({observation}) => {
            const available = observation()
            return available && {bands: available.bands.map(({name}) => ({name, dataType: {arrayDimensions: 1}})), evidence: []}
        }
    }),
    // Described by observing its own running image.
    [OBSERVED]: imageOutputProvider({describe: ({observation}) => observation()}),
    // Described from its configuration alone.
    [CONFIGURED]: imageOutputProvider({describe: ({recipe}) => ({bands: recipe.configuredBands, evidence: []})}),
    // Preservation is declared, never assumed.
    [PASS_THROUGH]: preservingProvider({role: 'image'}),
    // Reads the same role, deliberately changing values: reading an input must not mean preserving it.
    [CHANGING]: imageOutputProvider({
        role: 'image',
        describe: ({input}) => input() && {bands: [band('derived', 'mean')], evidence: []}
    }),
    // Receives every role-bearing input in declared edge order, repeats included, and states its mapping.
    [COMBINE]: imageOutputProvider({
        describe: ({inputs}) => {
            const all = inputs()
            return all && {
                bands: all.flatMap(({role, description}, index) =>
                    description.output.bands.map(({name, pyramidingPolicy}) =>
                        band(`${role}${index}_${name}`, pyramidingPolicy)
                    )
                ),
                evidence: all.flatMap(({description}) => description.evidence)
            }
        }
    }),
    // Refuses from its configuration, reading nothing: what it states is exactly what the recipe holds.
    [REFUSING]: imageOutputProvider({describe: ({recipe}) => recipe.refusal}),
    // Asks for its observation and refuses whatever it finds, so a refusal can meet evidence still missing.
    [OBSERVING_REFUSAL]: imageOutputProvider({
        describe: ({observation}) => {
            observation()
            return {diagnostics: [{code: 'SYNTHETIC_CONFLICT', path: ['model', 'x']}]}
        }
    }),
    // Describes itself from whichever of its inputs could be described, as no provider may.
    [PARTIAL]: imageOutputProvider({
        describe: ({describedInputs}) => ({
            bands: describedInputs().flatMap(({description}) => description.output.bands),
            evidence: []
        })
    }),
    // Emits its source bands last-first, so a resolver that carries policies by position rather than
    // with their band produces the right names against the wrong policies.
    [REORDER]: imageOutputProvider({
        describe: ({inputs}) => {
            const all = inputs()
            return all && {
                bands: all
                    .flatMap(({description}) => description.output.bands)
                    .reverse()
                    .map(({name, pyramidingPolicy}) => band(`r_${name}`, pyramidingPolicy)),
                evidence: []
            }
        }
    })
}

const resolve = ({recipes, edges, diagnostics, recipeDiagnostics, observations = {}, declarationFor, observationFor}) =>
    resolveImageOutput({
        graph: graph({recipes, edges, diagnostics, recipeDiagnostics}),
        declarationFor: declarationFor || (({type}) => declarations[type]),
        observationFor: observationFor || (({type, id}) => observations[`${type}:${id}`])
    })

const observation = (bands, evidence = []) => ({bands, evidence})

const described = (id, bands, evidence = []) => ({
    description: {
        executionReference: recipeReference(id),
        output: {kind: 'IMAGE', bands},
        evidence
    },
    diagnostics: []
})

const failed = diagnostics => ({description: null, diagnostics})

describe('provider contract', () => {
    it('rejects a provider with no describe function', () => {
        assert.throws(() => imageOutputProvider({}), /describe/)
        assert.throws(() => imageOutputProvider({describe: 'bands'}), /describe/)
    })

    it('rejects a blank or non-string role', () => {
        assert.throws(() => imageOutputProvider({role: '', describe: () => ({})}), /role/)
        assert.throws(() => imageOutputProvider({role: '  ', describe: () => ({})}), /role/)
        assert.throws(() => imageOutputProvider({role: 7, describe: () => ({})}), /role/)
        assert.throws(() => preservingProvider({}), /role/)
    })

    it('rejects effects that name no role', () => {
        assert.throws(
            () => imageOutputProvider({effects: {bandMapping: IDENTITY}, describe: () => ({})}),
            /role/
        )
    })

    // Declared for consumers, not for the resolver: resolution runs `describe` and never reads these.
    it('declares what preservation does to its input, so a consumer can ask without knowing the recipe type', () => {
        assert.deepEqual(
            preservingProvider({role: 'image'}).effects,
            {bandMapping: IDENTITY, values: PRESERVED, validity: NARROWED}
        )
    })

    it('names the role whose current schema also describes its output', () => {
        assert.equal(inheritedSchemaRole(preservingProvider({role: 'image'})), 'image')
    })

    it('names no role for a provider that is free to change its input', () => {
        assert.equal(inheritedSchemaRole(declarations[CHANGING]), undefined)
        assert.equal(inheritedSchemaRole(declarations[OBSERVED]), undefined)
        assert.equal(inheritedSchemaRole(undefined), undefined)
    })
})

describe('how a description is acquired', () => {
    const bands = [band('a', 'sample'), band('b', 'mode')]

    // A consumer of the root cannot tell whether its source was configured, observed or read from an asset.
    it('gives a consumer the same description whatever its source was acquired from', () => {
        const over = (source, extra = {}) => resolve({
            recipes: [node('root', PASS_THROUGH), ...(source ? [source] : [])],
            edges: [edge('root', 'image', source ? recipeReference(source.id) : assetReference('users/x/a'))],
            ...extra
        })

        const configured = over(node('inner', CONFIGURED, bands))
        const observed = over(node('inner', OBSERVED), {observations: {'RECIPE_REF:inner': observation(bands)}})
        const stored = over(null, {observations: {'ASSET:users/x/a': observation(bands)}})

        assert.deepEqual(configured, described('root', bands))
        assert.deepEqual(observed, configured)
        assert.deepEqual(stored, configured)
    })

    it('requests no observation for a description taken from configuration', () => {
        const asked = []
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH), node('inner', CONFIGURED, bands)],
            edges: [edge('root', 'image', recipeReference('inner'))],
            observationFor: reference => asked.push(reference) && undefined
        }), described('root', bands))
        assert.deepEqual(asked, [])
    })

    it('answers each read once, however often a provider asks', () => {
        const asked = []
        const rereading = imageOutputProvider({
            role: 'image',
            describe: ({input, observation}) => (input(), observation(), observation(), input())
        })
        const result = resolve({
            recipes: [node('root', 'REREADING'), node('inner', OBSERVED)],
            edges: [edge('root', 'image', recipeReference('inner'))],
            declarationFor: ({type}) => type === 'REREADING' ? rereading : declarations[type],
            observationFor: reference => {
                asked.push(reference)
                return undefined
            }
        })
        assert.deepEqual(asked, [recipeReference('inner'), recipeReference('root')])
        assert.deepEqual(
            result.diagnostics.map(({recipePath}) => recipePath),
            [['root', 'inner'], ['root']]
        )
    })

    it('does not describe a provider that throws', () => {
        const failing = imageOutputProvider({
            describe: () => {
                throw new Error('Malformed configuration')
            }
        })
        assert.throws(
            () => resolve({recipes: [node('root', 'FAILING')], declarationFor: () => failing}),
            /Malformed configuration/
        )
    })

    it('refuses to read an input for a provider that declares no role', () => {
        const undeclared = imageOutputProvider({describe: ({input}) => input()})
        assert.throws(() => resolve({
            recipes: [node('root', 'NO_ROLE')],
            edges: [edge('root', 'image', assetReference('users/x/a'))],
            declarationFor: () => undeclared
        }), /role/)
    })
})

describe('observed output', () => {
    it('produces its own ordered bands and policies from its observation', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', OBSERVED)],
            observations: {'RECIPE_REF:root': observation([band('a', 'sample'), band('b', 'mode')])}
        }), described('root', [band('a', 'sample'), band('b', 'mode')]))
    })

    it('reports an execution reference with no observation', () => {
        assert.deepEqual(resolve({recipes: [node('root', OBSERVED)]}), failed([{
            code: 'UNAVAILABLE_DESCRIPTION',
            path: [],
            recipePath: ['root'],
            reference: recipeReference('root')
        }]))
    })
})

describe('asset leaves', () => {
    const evidence = [{opaque: 'asset'}]
    const leaf = assetReference('users/x/leaf')

    const rootOverAsset = {
        // The asset is not a recipe, so it is never a node: the edge is the only thing that locates it.
        recipes: [node('root', PASS_THROUGH)],
        edges: [edge('root', 'image', leaf)]
    }

    it('preserves an asset observation while taking outer execution identity', () => {
        assert.deepEqual(resolve({
            ...rootOverAsset,
            observations: {'ASSET:users/x/leaf': observation([band('B1', 'sample'), band('B2', 'mode')], evidence)}
        }), described('root', [band('B1', 'sample'), band('B2', 'mode')], evidence))
    })

    it('asks for the asset reference itself, not the recipe that selected it', () => {
        const asked = []
        assert.deepEqual(resolve({
            ...rootOverAsset,
            observationFor: reference => {
                asked.push(reference)
                return observation([band('B1', 'sample')], evidence)
            }
        }), described('root', [band('B1', 'sample')], evidence))
        assert.deepEqual(asked, [leaf])
    })

    it('identifies the asset whose observation is malformed, not only the recipe that selected it', () => {
        assert.deepEqual(resolve({
            ...rootOverAsset,
            observations: {'ASSET:users/x/leaf': observation([band('a', 'sample'), band('a', 'mode')])}
        }), failed([{
            code: 'DUPLICATE_BAND_NAME',
            path: ['bands', 1, 'name'],
            recipePath: ['root'],
            reference: leaf
        }]))
    })

    it('reports an asset with no observation against the recipe that selected it', () => {
        assert.deepEqual(resolve(rootOverAsset), failed([{
            code: 'UNAVAILABLE_DESCRIPTION',
            role: 'image',
            path: ['model', 'image'],
            recipePath: ['root'],
            reference: leaf
        }]))
    })
})

describe('an input read through a declared role', () => {
    const evidence = [{opaque: 'inner'}]

    const chain = ({rootType = PASS_THROUGH, innerId = 'inner'} = {}) => ({
        recipes: [node('root', rootType), node(innerId, OBSERVED)],
        edges: [edge('root', 'image', recipeReference(innerId))],
        observations: {[`RECIPE_REF:${innerId}`]: observation([band('a', 'sample')], evidence)}
    })

    it('preserves names, order, policies and evidence while taking outer execution identity', () => {
        assert.deepEqual(resolve(chain()), described('root', [band('a', 'sample')], evidence))
    })

    it('selects its input by declared role, never by edge position', () => {
        assert.deepEqual(resolve({
            ...chain(),
            edges: [
                edge('root', 'mask', assetReference('users/x/mask')),
                edge('root', 'image', recipeReference('inner'))
            ]
        }), described('root', [band('a', 'sample')], evidence))
    })

    it('does not take output schema from a secondary input', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH), node('inner', OBSERVED), node('mask', OBSERVED)],
            edges: [
                edge('root', 'image', recipeReference('inner')),
                edge('root', 'mask', recipeReference('mask'))
            ],
            observations: {
                'RECIPE_REF:inner': observation([band('a', 'sample')], evidence),
                'RECIPE_REF:mask': observation([band('mask', 'mode')])
            }
        }), described('root', [band('a', 'sample')], evidence))
    })

    it('does not preserve when the provider changes its input instead', () => {
        assert.deepEqual(
            resolve(chain({rootType: CHANGING})),
            described('root', [band('derived', 'mean')])
        )
    })

    it('preserves requirements transitively through nesting', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH), node('mid', PASS_THROUGH), node('leaf', OBSERVED)],
            edges: [
                edge('root', 'image', recipeReference('mid')),
                edge('mid', 'image', recipeReference('leaf'))
            ],
            observations: {'RECIPE_REF:leaf': observation([band('a', 'sample'), band('b', 'mode')], evidence)}
        }), described('root', [band('a', 'sample'), band('b', 'mode')], evidence))
    })

    it('reports a declared role no edge carries', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'mask', assetReference('users/x/mask'))]
        }), failed([{code: 'MISSING_ROLE', role: 'image', path: [], recipePath: ['root']}]))
    })

    it('reports a role carried by more than one edge rather than choosing by position', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH), node('a', OBSERVED), node('b', OBSERVED)],
            edges: [
                edge('root', 'image', recipeReference('a')),
                edge('root', 'image', recipeReference('b'))
            ],
            observations: {
                'RECIPE_REF:a': observation([band('a', 'sample')]),
                'RECIPE_REF:b': observation([band('b', 'mode')])
            }
        }), failed([{code: 'AMBIGUOUS_ROLE', role: 'image', path: [], recipePath: ['root']}]))
    })
})

describe('every role-bearing input', () => {
    it('receives role-bearing inputs in declared edge order, repeated roles included', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', COMBINE), node('a', OBSERVED), node('b', OBSERVED)],
            edges: [
                edge('root', 'image', recipeReference('a')),
                edge('root', 'image', recipeReference('b')),
                edge('root', 'extra', recipeReference('a'))
            ],
            observations: {
                'RECIPE_REF:a': observation([band('x', 'sample')]),
                'RECIPE_REF:b': observation([band('y', 'mode')])
            }
        }), described('root', [
            band('image0_x', 'sample'),
            band('image1_y', 'mode'),
            band('extra2_x', 'sample')
        ]))
    })

    // Only a refusal may say what part of its inputs establishes.
    it('describes nothing from the inputs that could be described while another could not', () => {
        const result = resolve({
            recipes: [node('root', PARTIAL), node('a', OBSERVED), node('b', OBSERVED)],
            edges: [edge('root', 'image', recipeReference('a')), edge('root', 'image', recipeReference('b'))],
            observations: {'RECIPE_REF:a': observation([band('x', 'sample')])}
        })

        assert.equal(result.description, null)
        assert.deepEqual(result.diagnostics.map(({code}) => code), ['UNAVAILABLE_DESCRIPTION'])
    })

    it('describes from them all once every input could be described', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', PARTIAL), node('a', OBSERVED)],
            edges: [edge('root', 'image', recipeReference('a'))],
            observations: {'RECIPE_REF:a': observation([band('x', 'sample')])}
        }), described('root', [band('x', 'sample')]))
    })

    it('retains each unchanged band policy through explicit rename and reorder', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', REORDER), node('a', OBSERVED)],
            edges: [edge('root', 'only', recipeReference('a'))],
            observations: {'RECIPE_REF:a': observation([band('arr', 'sample'), band('val', 'mean')])}
        }), described('root', [band('r_val', 'mean'), band('r_arr', 'sample')]))
    })
})

describe('graph shape', () => {
    // Root-first DFS pre-order, exactly as the dependency graph emits it. Reversed this is [b, shared,
    // a, root], which visits b before the shared node it depends on: reversing `recipes` is not a
    // topological order, and a resolver that relies on it fails only here.
    const diamond = {
        recipes: [node('root', COMBINE), node('a', PASS_THROUGH), node('shared', OBSERVED), node('b', PASS_THROUGH)],
        edges: [
            edge('root', 'left', recipeReference('a')),
            edge('root', 'right', recipeReference('b')),
            edge('a', 'image', recipeReference('shared')),
            edge('b', 'image', recipeReference('shared'))
        ],
        observations: {'RECIPE_REF:shared': observation([band('s', 'sample')])}
    }

    it('resolves a shared node once and does not treat a diamond as a cycle', () => {
        assert.deepEqual(
            resolve(diamond),
            described('root', [band('left0_s', 'sample'), band('right1_s', 'sample')])
        )
    })

    it('resolves the shared node exactly once', () => {
        const derived = []
        assert.deepEqual(resolve({
            ...diamond,
            declarationFor: ({type}) => type === OBSERVED
                ? imageOutputProvider({describe: ({observation}) => (derived.push('shared'), observation())})
                : declarations[type]
        }), described('root', [band('left0_s', 'sample'), band('right1_s', 'sample')]))
        assert.deepEqual(derived, ['shared'])
    })

    it('diagnoses one unavailable shared node once, not once per incoming edge', () => {
        const asked = []
        assert.deepEqual(resolve({
            ...diamond,
            observationFor: reference => {
                asked.push(reference)
                return undefined
            }
        }), failed([{
            code: 'UNAVAILABLE_DESCRIPTION',
            path: [],
            recipePath: ['root', 'a', 'shared'],
            reference: recipeReference('shared')
        }]))
        assert.deepEqual(asked, [recipeReference('shared')])
    })
})

// Only what a description reads can fail it. The graph holds each structural diagnosis where it belongs - on the
// edge to an absent recipe, under the recipe whose own model is broken - and resolution meets it there.
describe('which structural diagnoses a description depends on', () => {
    const missing = {code: 'MISSING_SOURCE', role: 'image', path: ['model', 'image'], recipePath: ['root', 'gone']}
    const toAbsent = edge('root', 'image', recipeReference('gone'), missing)

    it('describes a recipe whose broken dependency it does not read, calling nothing for it', () => {
        const calls = []
        assert.deepEqual(resolve({
            recipes: [node('root', CONFIGURED, [band('a', 'mean')])],
            edges: [toAbsent],
            diagnostics: [missing],
            observationFor: reference => (calls.push(reference.id), undefined)
        }), described('root', [band('a', 'mean')]))
        assert.deepEqual(calls, [])
    })

    it('fails on a missing source it reads, diagnosed on that edge', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH)],
            edges: [toAbsent],
            diagnostics: [missing]
        }), failed([missing]))
    })

    it('reports a malformed field on the role it reads as that, not as a role no edge carries', () => {
        const incomplete = {code: 'INCOMPLETE_REFERENCE', role: 'image', path: ['model', 'image'], recipePath: ['root']}
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH)],
            diagnostics: [incomplete],
            recipeDiagnostics: new Map([['root', [incomplete]]])
        }), failed([incomplete]))
    })

    // A recipe whose model cannot be read is never handed to its provider, and is diagnosed rather than taken for a
    // type that states no output.
    it('fails a recipe whose own model is unreadable, whatever its provider would read', () => {
        const unsupported = {code: 'UNSUPPORTED_RECIPE_TYPE', path: [], recipePath: ['root']}
        const calls = []
        assert.deepEqual(resolve({
            recipes: [node('root', UNDECLARED)],
            diagnostics: [unsupported],
            recipeDiagnostics: new Map([['root', [unsupported]]]),
            declarationFor: recipe => (calls.push(recipe.id), undefined)
        }), failed([unsupported]))
        assert.deepEqual(calls, [])
    })

    // A conservative policy: observing a recipe may consult anything it depends on.
    it('requests no observation of a recipe with a structural diagnosis anywhere below it', () => {
        const incomplete = {code: 'INCOMPLETE_REFERENCE', role: 'unread', path: ['model', 'unread'], recipePath: ['root', 'inner']}
        const calls = []
        assert.deepEqual(resolve({
            recipes: [node('root', OBSERVED), node('inner', CONFIGURED, [band('b', 'mean')])],
            edges: [edge('root', 'image', recipeReference('inner'))],
            diagnostics: [incomplete],
            recipeDiagnostics: new Map([['inner', [incomplete]]]),
            observationFor: reference => (calls.push(reference.id), observation([band('a', 'sample')]))
        }), failed([incomplete]))
        assert.deepEqual(calls, [])
    })
})

describe('resolution diagnostics accumulate', () => {
    it('reports every independently broken branch in dependency-first order', () => {
        assert.deepEqual(resolve({
            recipes: [
                node('root', COMBINE),
                node('a', PASS_THROUGH),
                node('aLeaf', OBSERVED),
                node('b', PASS_THROUGH)
            ],
            edges: [
                edge('root', 'left', recipeReference('a')),
                edge('root', 'right', recipeReference('b')),
                edge('a', 'image', recipeReference('aLeaf'))
            ]
        }), failed([
            {
                code: 'UNAVAILABLE_DESCRIPTION',
                path: [],
                recipePath: ['root', 'a', 'aLeaf'],
                reference: recipeReference('aLeaf')
            },
            {code: 'MISSING_ROLE', role: 'image', path: [], recipePath: ['root', 'b']}
        ]))
    })

    it('reports a failed asset before a failed recipe when the asset edge comes first', () => {
        const leaf = assetReference('users/x/leaf')
        assert.deepEqual(resolve({
            recipes: [node('root', COMBINE), node('inner', OBSERVED)],
            edges: [
                edge('root', 'first', leaf),
                edge('root', 'second', recipeReference('inner'))
            ]
        }), failed([
            {
                code: 'UNAVAILABLE_DESCRIPTION',
                role: 'first',
                path: ['model', 'first'],
                recipePath: ['root'],
                reference: leaf
            },
            {
                code: 'UNAVAILABLE_DESCRIPTION',
                path: [],
                recipePath: ['root', 'inner'],
                reference: recipeReference('inner')
            }
        ]))
    })

    it('reports a malformed asset before a failed recipe when the asset edge comes first', () => {
        const leaf = assetReference('users/x/leaf')
        assert.deepEqual(resolve({
            recipes: [node('root', COMBINE), node('inner', OBSERVED)],
            edges: [
                edge('root', 'first', leaf),
                edge('root', 'second', recipeReference('inner'))
            ],
            observations: {'ASSET:users/x/leaf': observation([band('a', 'sample'), band('a', 'mode')])}
        }), failed([
            {code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root'], reference: leaf},
            {
                code: 'UNAVAILABLE_DESCRIPTION',
                path: [],
                recipePath: ['root', 'inner'],
                reference: recipeReference('inner')
            }
        ]))
    })

    // Registration refuses a type that states no output, so reaching one is a fault rather than something to report.
    it('fails for a readable recipe whose type states no output at all', () => {
        assert.throws(
            () => resolve({recipes: [node('root', UNDECLARED)]}),
            /SYNTHETIC_UNDECLARED states no image output/
        )
    })

    it('validates transformation output through the image output contract', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', OBSERVED)],
            observations: {'RECIPE_REF:root': observation([band('a', 'sample'), band('a', 'mode')])}
        }), failed([{code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root']}]))
    })
})

// A type that states it produces no image is not an image with no bands: whatever reads it is refused, however the
// rest of the read stands.
describe('a recipe whose type states it has no image output', () => {
    it('is refused as having none, where an image with no bands would be described', () => {
        assert.deepEqual(
            resolve({recipes: [node('root', NON_IMAGE)]}),
            failed([{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['root']}])
        )
        assert.deepEqual(resolve({recipes: [node('root', CONFIGURED, [])]}), described('root', []))
    })

    it('is refused where a wrapper reads it, located at the recipe that has none', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH), node('design', NON_IMAGE)],
            edges: [edge('root', 'image', recipeReference('design'))]
        }), failed([{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['root', 'design']}]))
    })

    it('is refused beside an input still to be observed', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', COMBINE), node('design', NON_IMAGE), node('observed', OBSERVED)],
            edges: [
                edge('root', 'left', recipeReference('design')),
                edge('root', 'right', recipeReference('observed'))
            ]
        }).diagnostics.map(({code, recipePath}) => [code, recipePath]), [
            ['NON_IMAGE_OUTPUT', ['root', 'design']],
            ['UNAVAILABLE_DESCRIPTION', ['root', 'observed']]
        ])
    })
})

// A description never leaves a band's dimensionality unknown. What is observed of an image must establish it; an
// observation of names alone describes only where the provider establishes it from its declaration.
describe('the dimensionality a description establishes', () => {
    it('is refused where an asset was observed without it', () => {
        const asset = assetReference('users/x/a')

        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'image', asset)],
            observations: {'ASSET:users/x/a': observation([{name: 'red'}])}
        }), failed([
            {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'dataType'], recipePath: ['root'], reference: asset}
        ]))
    })

    it('is refused where a running image was observed without it', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', OBSERVED)],
            observations: {'RECIPE_REF:root': observation([{name: 'a'}])}
        }), failed([{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'dataType'], recipePath: ['root']}]))
    })

    it('is described from names alone by a provider that establishes it', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', ESTABLISHING)],
            observations: {'RECIPE_REF:root': observation([{name: 'coefs'}])}
        }), described('root', [{name: 'coefs', dataType: {arrayDimensions: 1}}]))
    })
})

describe('a provider refusing to describe its recipe', () => {
    const refusing = (id, refusal) => ({...node(id, REFUSING), refusal})

    it('reports each diagnosis it states, located by the resolver, in place of a description', () => {
        assert.deepEqual(resolve({recipes: [refusing('root', {diagnostics: [
            {code: 'SYNTHETIC_CONFLICT', path: ['model', 'outputs', 1]},
            {code: 'SYNTHETIC_OTHER'}
        ]})]}), failed([
            {code: 'SYNTHETIC_CONFLICT', path: ['model', 'outputs', 1], recipePath: ['root']},
            {code: 'SYNTHETIC_OTHER', path: [], recipePath: ['root']}
        ]))
    })

    it('is located at the recipe that refused, below whatever read it', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH), refusing('inner', {diagnostics: [{code: 'SYNTHETIC_CONFLICT'}]})],
            edges: [edge('root', 'image', recipeReference('inner'))]
        }), failed([{code: 'SYNTHETIC_CONFLICT', path: [], recipePath: ['root', 'inner']}]))
    })

    it('is kept beside evidence its provider still needs', () => {
        assert.deepEqual(resolve({recipes: [node('root', OBSERVING_REFUSAL)]}), failed([
            {code: 'UNAVAILABLE_DESCRIPTION', path: [], recipePath: ['root'], reference: recipeReference('root')},
            {code: 'SYNTHETIC_CONFLICT', path: ['model', 'x'], recipePath: ['root']}
        ]))
    })

    for (const [scenario, refusal] of [
        ['no diagnosis at all', {diagnostics: []}],
        ['bands beside its diagnoses', {bands: [], evidence: [], diagnostics: [{code: 'SYNTHETIC_CONFLICT'}]}],
        ['a list that is not one', {diagnostics: {code: 'SYNTHETIC_CONFLICT'}}],
        ['a blank code', {diagnostics: [{code: ' '}]}],
        ['a code that is not a string', {diagnostics: [{code: 7}]}],
        ['a location that is not a path', {diagnostics: [{code: 'SYNTHETIC_CONFLICT', path: 'model.x'}]}],
        ['its own attribution', {diagnostics: [{code: 'SYNTHETIC_CONFLICT', recipePath: ['elsewhere']}]}],
        ['a recipe that is not held', {diagnostics: [{code: 'MISSING_SOURCE'}]}],
        ['an observation that was not supplied', {diagnostics: [{code: 'UNAVAILABLE_DESCRIPTION'}]}]
    ]) {
        it(`is malformed when it states ${scenario}`, () => {
            assert.deepEqual(
                resolve({recipes: [refusing('root', refusal)]}),
                failed([{code: 'MALFORMED_IMAGE_OUTPUT', path: ['diagnostics'], recipePath: ['root']}])
            )
        })
    }
})

describe('preserved detail', () => {
    it('keeps the outer execution reference when evidence points at inner references', () => {
        const evidence = [{reference: recipeReference('inner')}, {reference: assetReference('users/x/a')}]
        assert.deepEqual(resolve({
            recipes: [node('root', PASS_THROUGH), node('inner', OBSERVED)],
            edges: [edge('root', 'image', recipeReference('inner'))],
            observations: {'RECIPE_REF:inner': observation([band('a', 'sample')], evidence)}
        }), described('root', [band('a', 'sample')], evidence))
    })

    it('accepts an unknown non-blank pyramiding policy and an empty band list', () => {
        assert.deepEqual(resolve({
            recipes: [node('root', OBSERVED)],
            observations: {'RECIPE_REF:root': observation([band('a', 'someFuturePolicy')])}
        }), described('root', [band('a', 'someFuturePolicy')]))
        assert.deepEqual(resolve({
            recipes: [node('root', OBSERVED)],
            observations: {'RECIPE_REF:root': observation([])}
        }), described('root', []))
    })

    it('retains opaque evidence entries by identity and owns the arrays it returns', () => {
        const entry = {opaque: 'evidence'}
        const observations = {'RECIPE_REF:root': observation([band('a', 'sample')], [entry])}
        const result = resolve({recipes: [node('root', OBSERVED)], observations})

        assert.deepEqual(result, described('root', [band('a', 'sample')], [entry]))
        assert.equal(result.description.evidence[0], entry)
        assert.notEqual(result.description.evidence, observations['RECIPE_REF:root'].evidence)
        assert.notEqual(result.description.output.bands, observations['RECIPE_REF:root'].bands)
    })

    it('is deterministic and mutates nothing it was given', () => {
        const observations = {'RECIPE_REF:inner': observation([band('a', 'sample')], [{opaque: 'e'}])}
        const input = {
            recipes: [node('root', PASS_THROUGH), node('inner', OBSERVED)],
            edges: [edge('root', 'image', recipeReference('inner'))],
            observations
        }
        const before = JSON.stringify(input)
        const expected = described('root', [band('a', 'sample')], [{opaque: 'e'}])

        assert.deepEqual(resolve(input), expected)
        assert.deepEqual(resolve(input), expected)
        assert.deepEqual(JSON.stringify(input), before)
    })
})
