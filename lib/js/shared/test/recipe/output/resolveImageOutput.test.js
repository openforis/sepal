import {
    IDENTITY,
    imageOutputProvider,
    inheritedSchemaRole,
    NARROWED,
    PRESERVED,
    preservingProvider
} from '#sepal/recipe/output/provider'
import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'

// Diagnostic codes are asserted as literals throughout. Importing the constants would let production and
// these tests rename together and stay green, and this suite is where their external meaning is defined.

const recipeReference = id => ({type: 'RECIPE_REF', id})
const assetReference = id => ({type: 'ASSET', id})
const band = (name, pyramidingPolicy) => ({name, pyramidingPolicy})
const edge = (sourceRecipeId, role, reference) =>
    ({sourceRecipeId, role, reference, path: ['model', role]})

// Graphs are written out rather than built, so each shape - and in particular the root-first order of
// `recipes` - is visible in the test that depends on it.
const graph = ({recipes, edges = [], diagnostics = []}) => ({recipes, edges, diagnostics})
const node = (id, type, configuredBands) => ({id, type, ...(configuredBands && {configuredBands})})

// Synthetic types only: no real recipe type is activated, and nothing is registered anywhere.
const OBSERVED = 'SYNTHETIC_OBSERVED'
const CONFIGURED = 'SYNTHETIC_CONFIGURED'
const PASS_THROUGH = 'SYNTHETIC_PASS_THROUGH'
const CHANGING = 'SYNTHETIC_CHANGING'
const COMBINE = 'SYNTHETIC_COMBINE'
const REORDER = 'SYNTHETIC_REORDER'
const UNDECLARED = 'SYNTHETIC_UNDECLARED'

const declarations = {
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

const resolve = ({recipes, edges, diagnostics, observations = {}, declarationFor, observationFor}) =>
    resolveImageOutput({
        graph: graph({recipes, edges, diagnostics}),
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
        expect(() => imageOutputProvider({})).toThrow(/describe/)
        expect(() => imageOutputProvider({describe: 'bands'})).toThrow(/describe/)
    })

    it('rejects a blank or non-string role', () => {
        expect(() => imageOutputProvider({role: '', describe: () => ({})})).toThrow(/role/)
        expect(() => imageOutputProvider({role: '  ', describe: () => ({})})).toThrow(/role/)
        expect(() => imageOutputProvider({role: 7, describe: () => ({})})).toThrow(/role/)
        expect(() => preservingProvider({})).toThrow(/role/)
    })

    it('rejects effects that name no role', () => {
        expect(() => imageOutputProvider({effects: {bandMapping: IDENTITY}, describe: () => ({})})).toThrow(/role/)
    })

    // Declared for consumers, not for the resolver: resolution runs `describe` and never reads these.
    it('declares what preservation does to its input, so a consumer can ask without knowing the recipe type', () => {
        expect(preservingProvider({role: 'image'}).effects)
            .toEqual({bandMapping: IDENTITY, values: PRESERVED, validity: NARROWED})
    })

    it('names the role whose current schema also describes its output', () => {
        expect(inheritedSchemaRole(preservingProvider({role: 'image'}))).toBe('image')
    })

    it('names no role for a provider that is free to change its input', () => {
        expect(inheritedSchemaRole(declarations[CHANGING])).toBeUndefined()
        expect(inheritedSchemaRole(declarations[OBSERVED])).toBeUndefined()
        expect(inheritedSchemaRole(undefined)).toBeUndefined()
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

        expect(configured).toEqual(described('root', bands))
        expect(observed).toEqual(configured)
        expect(stored).toEqual(configured)
    })

    it('requests no observation for a description taken from configuration', () => {
        const asked = []
        expect(resolve({
            recipes: [node('root', PASS_THROUGH), node('inner', CONFIGURED, bands)],
            edges: [edge('root', 'image', recipeReference('inner'))],
            observationFor: reference => asked.push(reference) && undefined
        })).toEqual(described('root', bands))
        expect(asked).toEqual([])
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
        expect(asked).toEqual([recipeReference('inner'), recipeReference('root')])
        expect(result.diagnostics.map(({recipePath}) => recipePath)).toEqual([['root', 'inner'], ['root']])
    })

    it('does not describe a provider that throws', () => {
        const failing = imageOutputProvider({
            describe: () => {
                throw new Error('Malformed configuration')
            }
        })
        expect(() => resolve({recipes: [node('root', 'FAILING')], declarationFor: () => failing}))
            .toThrow('Malformed configuration')
    })

    it('refuses to read an input for a provider that declares no role', () => {
        const undeclared = imageOutputProvider({describe: ({input}) => input()})
        expect(() => resolve({
            recipes: [node('root', 'NO_ROLE')],
            edges: [edge('root', 'image', assetReference('users/x/a'))],
            declarationFor: () => undeclared
        })).toThrow(/role/)
    })
})

describe('observed output', () => {
    it('produces its own ordered bands and policies from its observation', () => {
        expect(resolve({
            recipes: [node('root', OBSERVED)],
            observations: {'RECIPE_REF:root': observation([band('a', 'sample'), band('b', 'mode')])}
        })).toEqual(described('root', [band('a', 'sample'), band('b', 'mode')]))
    })

    it('reports an execution reference with no observation', () => {
        expect(resolve({recipes: [node('root', OBSERVED)]})).toEqual(failed([{
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
        expect(resolve({
            ...rootOverAsset,
            observations: {'ASSET:users/x/leaf': observation([band('B1', 'sample'), band('B2', 'mode')], evidence)}
        })).toEqual(described('root', [band('B1', 'sample'), band('B2', 'mode')], evidence))
    })

    it('asks for the asset reference itself, not the recipe that selected it', () => {
        const asked = []
        expect(resolve({
            ...rootOverAsset,
            observationFor: reference => {
                asked.push(reference)
                return observation([band('B1', 'sample')], evidence)
            }
        })).toEqual(described('root', [band('B1', 'sample')], evidence))
        expect(asked).toEqual([leaf])
    })

    it('identifies the asset whose observation is malformed, not only the recipe that selected it', () => {
        expect(resolve({
            ...rootOverAsset,
            observations: {'ASSET:users/x/leaf': observation([band('a', 'sample'), band('a', 'mode')])}
        })).toEqual(failed([{
            code: 'DUPLICATE_BAND_NAME',
            path: ['bands', 1, 'name'],
            recipePath: ['root'],
            reference: leaf
        }]))
    })

    it('reports an asset with no observation against the recipe that selected it', () => {
        expect(resolve(rootOverAsset)).toEqual(failed([{
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
        expect(resolve(chain())).toEqual(described('root', [band('a', 'sample')], evidence))
    })

    it('selects its input by declared role, never by edge position', () => {
        expect(resolve({
            ...chain(),
            edges: [
                edge('root', 'mask', assetReference('users/x/mask')),
                edge('root', 'image', recipeReference('inner'))
            ]
        })).toEqual(described('root', [band('a', 'sample')], evidence))
    })

    it('does not take output schema from a secondary input', () => {
        expect(resolve({
            recipes: [node('root', PASS_THROUGH), node('inner', OBSERVED), node('mask', OBSERVED)],
            edges: [
                edge('root', 'image', recipeReference('inner')),
                edge('root', 'mask', recipeReference('mask'))
            ],
            observations: {
                'RECIPE_REF:inner': observation([band('a', 'sample')], evidence),
                'RECIPE_REF:mask': observation([band('mask', 'mode')])
            }
        })).toEqual(described('root', [band('a', 'sample')], evidence))
    })

    it('does not preserve when the provider changes its input instead', () => {
        expect(resolve(chain({rootType: CHANGING}))).toEqual(described('root', [band('derived', 'mean')]))
    })

    it('preserves requirements transitively through nesting', () => {
        expect(resolve({
            recipes: [node('root', PASS_THROUGH), node('mid', PASS_THROUGH), node('leaf', OBSERVED)],
            edges: [
                edge('root', 'image', recipeReference('mid')),
                edge('mid', 'image', recipeReference('leaf'))
            ],
            observations: {'RECIPE_REF:leaf': observation([band('a', 'sample'), band('b', 'mode')], evidence)}
        })).toEqual(described('root', [band('a', 'sample'), band('b', 'mode')], evidence))
    })

    it('reports a declared role no edge carries', () => {
        expect(resolve({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'mask', assetReference('users/x/mask'))]
        })).toEqual(failed([{code: 'MISSING_ROLE', role: 'image', path: [], recipePath: ['root']}]))
    })

    it('reports a role carried by more than one edge rather than choosing by position', () => {
        expect(resolve({
            recipes: [node('root', PASS_THROUGH), node('a', OBSERVED), node('b', OBSERVED)],
            edges: [
                edge('root', 'image', recipeReference('a')),
                edge('root', 'image', recipeReference('b'))
            ],
            observations: {
                'RECIPE_REF:a': observation([band('a', 'sample')]),
                'RECIPE_REF:b': observation([band('b', 'mode')])
            }
        })).toEqual(failed([{code: 'AMBIGUOUS_ROLE', role: 'image', path: [], recipePath: ['root']}]))
    })
})

describe('every role-bearing input', () => {
    it('receives role-bearing inputs in declared edge order, repeated roles included', () => {
        expect(resolve({
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
        })).toEqual(described('root', [
            band('image0_x', 'sample'),
            band('image1_y', 'mode'),
            band('extra2_x', 'sample')
        ]))
    })

    it('retains each unchanged band policy through explicit rename and reorder', () => {
        expect(resolve({
            recipes: [node('root', REORDER), node('a', OBSERVED)],
            edges: [edge('root', 'only', recipeReference('a'))],
            observations: {'RECIPE_REF:a': observation([band('arr', 'sample'), band('val', 'mean')])}
        })).toEqual(described('root', [band('r_val', 'mean'), band('r_arr', 'sample')]))
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
        expect(resolve(diamond)).toEqual(described('root', [band('left0_s', 'sample'), band('right1_s', 'sample')]))
    })

    it('resolves the shared node exactly once', () => {
        const derived = []
        expect(resolve({
            ...diamond,
            declarationFor: ({type}) => type === OBSERVED
                ? imageOutputProvider({describe: ({observation}) => (derived.push('shared'), observation())})
                : declarations[type]
        })).toEqual(described('root', [band('left0_s', 'sample'), band('right1_s', 'sample')]))
        expect(derived).toEqual(['shared'])
    })

    it('diagnoses one unavailable shared node once, not once per incoming edge', () => {
        const asked = []
        expect(resolve({
            ...diamond,
            observationFor: reference => {
                asked.push(reference)
                return undefined
            }
        })).toEqual(failed([{
            code: 'UNAVAILABLE_DESCRIPTION',
            path: [],
            recipePath: ['root', 'a', 'shared'],
            reference: recipeReference('shared')
        }]))
        expect(asked).toEqual([recipeReference('shared')])
    })
})

describe('graph diagnostics gate resolution', () => {
    const graphDiagnostics = [
        {code: 'MISSING_SOURCE', role: 'image', path: ['model', 'image'], recipePath: ['root', 'gone']},
        {code: 'CYCLIC_DEPENDENCY', role: 'image', path: ['model', 'image'], recipePath: ['root', 'root']}
    ]

    const broken = {
        recipes: [node('root', PASS_THROUGH)],
        edges: [edge('root', 'image', recipeReference('gone'))],
        diagnostics: graphDiagnostics
    }

    it('surfaces graph diagnostics verbatim rather than re-deriving them, and describes nothing', () => {
        expect(resolve(broken)).toEqual(failed(graphDiagnostics))
    })

    it('resolves nothing at all when the graph is already broken', () => {
        const calls = []
        expect(resolve({
            ...broken,
            declarationFor: recipe => {
                calls.push(['declarationFor', recipe.id])
                return imageOutputProvider({
                    describe: ({observation}) => (calls.push(['describe']), observation())
                })
            },
            observationFor: reference => {
                calls.push(['observationFor', reference.id])
                return observation([band('a', 'sample')])
            }
        })).toEqual(failed(graphDiagnostics))
        expect(calls).toEqual([])
    })
})

describe('resolution diagnostics accumulate', () => {
    it('reports every independently broken branch in dependency-first order', () => {
        expect(resolve({
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
        })).toEqual(failed([
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
        expect(resolve({
            recipes: [node('root', COMBINE), node('inner', OBSERVED)],
            edges: [
                edge('root', 'first', leaf),
                edge('root', 'second', recipeReference('inner'))
            ]
        })).toEqual(failed([
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
        expect(resolve({
            recipes: [node('root', COMBINE), node('inner', OBSERVED)],
            edges: [
                edge('root', 'first', leaf),
                edge('root', 'second', recipeReference('inner'))
            ],
            observations: {'ASSET:users/x/leaf': observation([band('a', 'sample'), band('a', 'mode')])}
        })).toEqual(failed([
            {code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root'], reference: leaf},
            {
                code: 'UNAVAILABLE_DESCRIPTION',
                path: [],
                recipePath: ['root', 'inner'],
                reference: recipeReference('inner')
            }
        ]))
    })

    it('reports a recipe type that declares no output', () => {
        expect(resolve({recipes: [node('root', UNDECLARED)]})).toEqual(
            failed([{code: 'UNDECLARED_OUTPUT', path: [], recipePath: ['root']}])
        )
    })

    it('validates transformation output through the image output contract', () => {
        expect(resolve({
            recipes: [node('root', OBSERVED)],
            observations: {'RECIPE_REF:root': observation([band('a', 'sample'), band('a', 'mode')])}
        })).toEqual(failed([{code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root']}]))
    })
})

describe('preserved detail', () => {
    it('keeps the outer execution reference when evidence points at inner references', () => {
        const evidence = [{reference: recipeReference('inner')}, {reference: assetReference('users/x/a')}]
        expect(resolve({
            recipes: [node('root', PASS_THROUGH), node('inner', OBSERVED)],
            edges: [edge('root', 'image', recipeReference('inner'))],
            observations: {'RECIPE_REF:inner': observation([band('a', 'sample')], evidence)}
        })).toEqual(described('root', [band('a', 'sample')], evidence))
    })

    it('accepts an unknown non-blank pyramiding policy and an empty band list', () => {
        expect(resolve({
            recipes: [node('root', OBSERVED)],
            observations: {'RECIPE_REF:root': observation([band('a', 'someFuturePolicy')])}
        })).toEqual(described('root', [band('a', 'someFuturePolicy')]))
        expect(resolve({
            recipes: [node('root', OBSERVED)],
            observations: {'RECIPE_REF:root': observation([])}
        })).toEqual(described('root', []))
    })

    it('retains opaque evidence entries by identity and owns the arrays it returns', () => {
        const entry = {opaque: 'evidence'}
        const observations = {'RECIPE_REF:root': observation([band('a', 'sample')], [entry])}
        const result = resolve({recipes: [node('root', OBSERVED)], observations})

        expect(result).toEqual(described('root', [band('a', 'sample')], [entry]))
        expect(result.description.evidence[0]).toBe(entry)
        expect(result.description.evidence).not.toBe(observations['RECIPE_REF:root'].evidence)
        expect(result.description.output.bands).not.toBe(observations['RECIPE_REF:root'].bands)
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

        expect(resolve(input)).toEqual(expected)
        expect(resolve(input)).toEqual(expected)
        expect(JSON.stringify(input)).toEqual(before)
    })
})
