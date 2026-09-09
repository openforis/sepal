import _ from 'lodash'

import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {
    IDENTITY,
    inheritedSchemaRole,
    intrinsicImageOutput,
    NARROWED,
    naryTransformation,
    oneInputTransformation,
    PRESERVED,
    preservingTransformation
} from '#sepal/recipe/output/transformation'

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
const node = (id, type) => ({id, type})

// Synthetic types only: no real recipe type is activated, and nothing is registered anywhere.
const INTRINSIC = 'SYNTHETIC_INTRINSIC'
const PASS_THROUGH = 'SYNTHETIC_PASS_THROUGH'
const DERIVED = 'SYNTHETIC_DERIVED'
const COMBINE = 'SYNTHETIC_COMBINE'
const REORDER = 'SYNTHETIC_REORDER'
const UNDECLARED = 'SYNTHETIC_UNDECLARED'

const declarations = {
    // Derives its output from the observation supplied for its own reference; it holds no static bands.
    [INTRINSIC]: intrinsicImageOutput({derive: ({observation}) => observation}),
    // Preservation is declared, never assumed.
    [PASS_THROUGH]: preservingTransformation({role: 'image'}),
    // The same one-input shape, deliberately changing values: absence of a transform must not mean
    // "preserve everything".
    [DERIVED]: oneInputTransformation({
        role: 'image',
        transform: () => ({bands: [band('derived', 'mean')], evidence: []})
    }),
    // Receives every role-bearing input in declared edge order, repeats included, and states its mapping.
    [COMBINE]: naryTransformation({
        transform: ({inputs}) => ({
            bands: inputs.flatMap(({role, description}, index) =>
                description.output.bands.map(({name, pyramidingPolicy}) =>
                    band(`${role}${index}_${name}`, pyramidingPolicy)
                )
            ),
            evidence: inputs.flatMap(({description}) => description.evidence)
        })
    }),
    // Emits its source bands last-first, so a resolver that carries policies by position rather than
    // with their band produces the right names against the wrong policies.
    [REORDER]: naryTransformation({
        transform: ({inputs}) => ({
            bands: inputs
                .flatMap(({description}) => description.output.bands)
                .reverse()
                .map(({name, pyramidingPolicy}) => band(`r_${name}`, pyramidingPolicy)),
            evidence: []
        })
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

describe('declaration contract', () => {
    it('rejects an intrinsic output with no derive function', () => {
        expect(() => intrinsicImageOutput({})).toThrow(/derive/)
        expect(() => intrinsicImageOutput({derive: 'bands'})).toThrow(/derive/)
    })

    it('rejects a one-input transformation with a blank or non-string role', () => {
        expect(() => oneInputTransformation({role: '', transform: () => ({})})).toThrow(/role/)
        expect(() => oneInputTransformation({role: '  ', transform: () => ({})})).toThrow(/role/)
        expect(() => oneInputTransformation({role: 7, transform: () => ({})})).toThrow(/role/)
    })

    it('rejects a one-input transformation with no transform function', () => {
        expect(() => oneInputTransformation({role: 'image'})).toThrow(/transform/)
        expect(() => oneInputTransformation({role: 'image', transform: {}})).toThrow(/transform/)
    })

    it('rejects a preserving transformation with an invalid role', () => {
        expect(() => preservingTransformation({})).toThrow(/role/)
        expect(() => preservingTransformation({role: ''})).toThrow(/role/)
    })

    it('rejects an n-ary transformation with no transform function', () => {
        expect(() => naryTransformation({})).toThrow(/transform/)
        expect(() => naryTransformation({transform: []})).toThrow(/transform/)
    })

    it('preserves through an ordinary identity transform, with no marker the resolver interprets', () => {
        const declaration = preservingTransformation({role: 'image'})
        const description = {
            executionReference: recipeReference('inner'),
            output: {kind: 'IMAGE', bands: [band('a', 'sample')]},
            evidence: [{opaque: 'inner'}]
        }

        expect(declaration.preserve).toBeUndefined()
        expect(_.omit(declaration, 'effects'))
            .toEqual(oneInputTransformation({role: 'image', transform: declaration.transform}))
        expect(declaration.transform({input: {role: 'image', description}}))
            .toEqual({bands: description.output.bands, evidence: description.evidence})
    })

    // Declared for consumers, not for the resolver: resolution runs the transform function and never reads
    // these, which is why the case above still holds once they are removed.
    it('declares what it does to its input, so a consumer can ask without knowing the recipe type', () => {
        expect(preservingTransformation({role: 'image'}).effects)
            .toEqual({bandMapping: IDENTITY, values: PRESERVED, validity: NARROWED})
    })

    it('names the role whose current schema also describes its output', () => {
        expect(inheritedSchemaRole(preservingTransformation({role: 'image'}))).toBe('image')
    })

    it('names no role for a transformation that is free to change its input', () => {
        const changing = oneInputTransformation({role: 'image', transform: () => ({bands: []})})

        expect(inheritedSchemaRole(changing)).toBeUndefined()
        expect(inheritedSchemaRole(intrinsicImageOutput({derive: () => ({bands: []})}))).toBeUndefined()
        expect(inheritedSchemaRole(undefined)).toBeUndefined()
    })
})

describe('intrinsic output', () => {
    it('produces its own ordered bands and policies from its observation', () => {
        expect(resolve({
            recipes: [node('root', INTRINSIC)],
            observations: {'RECIPE_REF:root': observation([band('a', 'sample'), band('b', 'mode')])}
        })).toEqual(described('root', [band('a', 'sample'), band('b', 'mode')]))
    })

    it('reports an execution reference with no observation', () => {
        expect(resolve({recipes: [node('root', INTRINSIC)]})).toEqual(failed([{
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

describe('one-input transformation', () => {
    const evidence = [{opaque: 'inner'}]

    const chain = ({rootType = PASS_THROUGH, innerId = 'inner'} = {}) => ({
        recipes: [node('root', rootType), node(innerId, INTRINSIC)],
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
            recipes: [node('root', PASS_THROUGH), node('inner', INTRINSIC), node('mask', INTRINSIC)],
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

    it('does not preserve when the declaration transforms instead', () => {
        expect(resolve(chain({rootType: DERIVED}))).toEqual(described('root', [band('derived', 'mean')]))
    })

    it('preserves requirements transitively through nesting', () => {
        expect(resolve({
            recipes: [node('root', PASS_THROUGH), node('mid', PASS_THROUGH), node('leaf', INTRINSIC)],
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
            recipes: [node('root', PASS_THROUGH), node('a', INTRINSIC), node('b', INTRINSIC)],
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

describe('n-ary transformation', () => {
    it('receives role-bearing inputs in declared edge order, repeated roles included', () => {
        expect(resolve({
            recipes: [node('root', COMBINE), node('a', INTRINSIC), node('b', INTRINSIC)],
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
            recipes: [node('root', REORDER), node('a', INTRINSIC)],
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
        recipes: [node('root', COMBINE), node('a', PASS_THROUGH), node('shared', INTRINSIC), node('b', PASS_THROUGH)],
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
            declarationFor: ({type}) => type === INTRINSIC
                ? intrinsicImageOutput({derive: ({observation}) => (derived.push('shared'), observation)})
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
                return intrinsicImageOutput({
                    derive: ({observation}) => (calls.push(['derive']), observation)
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
                node('aLeaf', INTRINSIC),
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
            recipes: [node('root', COMBINE), node('inner', INTRINSIC)],
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
            recipes: [node('root', COMBINE), node('inner', INTRINSIC)],
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
            recipes: [node('root', INTRINSIC)],
            observations: {'RECIPE_REF:root': observation([band('a', 'sample'), band('a', 'mode')])}
        })).toEqual(failed([{code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root']}]))
    })
})

describe('preserved detail', () => {
    it('keeps the outer execution reference when evidence points at inner references', () => {
        const evidence = [{reference: recipeReference('inner')}, {reference: assetReference('users/x/a')}]
        expect(resolve({
            recipes: [node('root', PASS_THROUGH), node('inner', INTRINSIC)],
            edges: [edge('root', 'image', recipeReference('inner'))],
            observations: {'RECIPE_REF:inner': observation([band('a', 'sample')], evidence)}
        })).toEqual(described('root', [band('a', 'sample')], evidence))
    })

    it('accepts an unknown non-blank pyramiding policy and an empty band list', () => {
        expect(resolve({
            recipes: [node('root', INTRINSIC)],
            observations: {'RECIPE_REF:root': observation([band('a', 'someFuturePolicy')])}
        })).toEqual(described('root', [band('a', 'someFuturePolicy')]))
        expect(resolve({
            recipes: [node('root', INTRINSIC)],
            observations: {'RECIPE_REF:root': observation([])}
        })).toEqual(described('root', []))
    })

    it('retains opaque evidence entries by identity and owns the arrays it returns', () => {
        const entry = {opaque: 'evidence'}
        const observations = {'RECIPE_REF:root': observation([band('a', 'sample')], [entry])}
        const result = resolve({recipes: [node('root', INTRINSIC)], observations})

        expect(result).toEqual(described('root', [band('a', 'sample')], [entry]))
        expect(result.description.evidence[0]).toBe(entry)
        expect(result.description.evidence).not.toBe(observations['RECIPE_REF:root'].evidence)
        expect(result.description.output.bands).not.toBe(observations['RECIPE_REF:root'].bands)
    })

    it('is deterministic and mutates nothing it was given', () => {
        const observations = {'RECIPE_REF:inner': observation([band('a', 'sample')], [{opaque: 'e'}])}
        const input = {
            recipes: [node('root', PASS_THROUGH), node('inner', INTRINSIC)],
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
