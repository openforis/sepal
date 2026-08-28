import {Observable, of, Subject} from 'rxjs'

import {createImageOutputObserver, referenceKey} from '#sepal/recipe/output/observeImageOutput'
import {intrinsicImageOutput, naryTransformation, preservingTransformation} from '#sepal/recipe/output/transformation'

// Statuses and diagnostic codes are asserted as literals: importing them would let production and these
// tests rename together and stay green, and this suite is where their external meaning is defined.

const recipeReference = id => ({type: 'RECIPE_REF', id})
const assetReference = id => ({type: 'ASSET', id})
const band = (name, pyramidingPolicy) => ({name, pyramidingPolicy})
const edge = (sourceRecipeId, role, reference) =>
    ({sourceRecipeId, role, reference, path: ['model', role]})
const node = (id, type) => ({id, type})
const graph = ({recipes, edges = [], diagnostics = []}) => ({recipes, edges, diagnostics})

const state = ({status, description = null, diagnostics = [], error = null}) =>
    ({status, description, diagnostics, error})

const described = (id, bands, evidence = []) => ({
    executionReference: recipeReference(id),
    output: {kind: 'IMAGE', bands},
    evidence
})

// Synthetic types only. Nothing is registered, and no real recipe declaration is activated.
const SAMPLED = 'SYNTHETIC_SAMPLED'
const CLASS_BASED = 'SYNTHETIC_CLASS_BASED'
const PASS_THROUGH = 'SYNTHETIC_PASS_THROUGH'
const COMBINE = 'SYNTHETIC_COMBINE'
const DUPLICATING = 'SYNTHETIC_DUPLICATING'
const UNDECLARED = 'SYNTHETIC_UNDECLARED'

const declarations = {
    // The declaration owns the policy. It maps observed names in observed order and states each policy;
    // nothing downstream may supply one on its behalf.
    [SAMPLED]: intrinsicImageOutput({
        derive: ({observation}) => ({
            bands: observation.bandNames.map(name => band(name, 'sample')),
            evidence: []
        })
    }),
    [CLASS_BASED]: intrinsicImageOutput({
        derive: ({observation}) => ({
            bands: observation.bandNames.map(name => band(name, name === 'class' ? 'mode' : 'mean')),
            evidence: []
        })
    }),
    [DUPLICATING]: intrinsicImageOutput({
        derive: ({observation}) => ({
            bands: observation.bandNames.map(() => band('same', 'mean')),
            evidence: []
        })
    }),
    [PASS_THROUGH]: preservingTransformation({role: 'image'}),
    [COMBINE]: naryTransformation({
        transform: ({inputs}) => ({
            bands: inputs.flatMap(({description}) => description.output.bands),
            evidence: []
        })
    })
}

const observerOver = ({synchronous = {}} = {}) => {
    const requests = []
    const subscribed = []
    const torndown = []
    const subjectsByKey = {}
    const subjectOf = reference => {
        const key = referenceKey(reference)
        if (!subjectsByKey[key]) {
            subjectsByKey[key] = new Subject()
        }
        return subjectsByKey[key]
    }
    const observer = createImageOutputObserver({
        observeBandNames$: request => {
            const key = referenceKey(request.reference)
            requests.push(request)
            return new Observable(subscriber => {
                subscribed.push(key)
                const source = synchronous[key] ? of(synchronous[key]) : subjectOf(request.reference)
                const inner = source.subscribe(subscriber)
                return () => {
                    torndown.push(key)
                    inner.unsubscribe()
                }
            })
        },
        declarationFor: ({type}) => declarations[type]
    })
    const states = []
    let terminated = null
    observer.state$.subscribe({
        next: published => states.push(published),
        error: error => terminated = {error},
        complete: () => terminated = {complete: true}
    })
    return {
        observer, requests, subscribed, torndown, states, subjectsByKey, subjectOf,
        terminated: () => terminated,
        emit: (reference, bandNames) => {
            const subject = subjectOf(reference)
            subject.next(bandNames)
            subject.complete()
        }
    }
}

const latest = states => states[states.length - 1]

const chain = () => graph({
    recipes: [node('root', PASS_THROUGH), node('inner', CLASS_BASED)],
    edges: [edge('root', 'image', recipeReference('inner'))]
})

const twoBranches = () => graph({
    recipes: [node('root', COMBINE), node('a', SAMPLED), node('b', CLASS_BASED)],
    edges: [
        edge('root', 'left', recipeReference('a')),
        edge('root', 'right', recipeReference('b'))
    ]
})

describe('observation boundary', () => {
    it('supplies the exact graph recipe record beside a recipe reference', () => {
        const inner = node('inner', CLASS_BASED)
        const {observer, requests} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH), inner],
            edges: [edge('root', 'image', recipeReference('inner'))]
        }))

        expect(requests).toEqual([{reference: recipeReference('inner'), recipe: inner}])
    })

    it('supplies an asset reference without fabricating a recipe record', () => {
        const leaf = assetReference('users/x/leaf')
        const {observer, requests} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'image', leaf)]
        }))

        expect(requests).toEqual([{reference: leaf}])
        expect('recipe' in requests[0]).toBe(false)
    })
})

describe('lifecycle', () => {
    it('starts pending on a read-only state$, with no observation requested', () => {
        const {observer, states, requests} = observerOver()

        expect(observer.state$.next).toBeUndefined()
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
        expect(requests).toEqual([])
    })

    it('is loading while the observations it requested are in flight', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(twoBranches())

        expect(latest(states)).toEqual(state({status: 'LOADING'}))
        expect(requests.map(({reference}) => reference))
            .toEqual([recipeReference('a'), recipeReference('b')])
    })

    it('is ready once every observation resolves', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(chain())
        emit(recipeReference('inner'), ['class', 'probability'])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('class', 'mode'), band('probability', 'mean')])
        }))
    })

    it('returns to pending on cancel, tearing down what was in flight', () => {
        const {observer, states, torndown} = observerOver()
        observer.observe(twoBranches())
        expect(torndown).toEqual([])

        observer.cancel()
        expect([...torndown].sort()).toEqual(['RECIPE_REF:a', 'RECIPE_REF:b'])
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
    })

    it('observes again after a cancel', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(twoBranches())
        observer.cancel()

        observer.observe(chain())
        emit(recipeReference('inner'), ['class'])
        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('class', 'mode')])
        }))
    })
})

describe('observation failure', () => {
    it('reports the failure as unavailable, retaining the error unchanged', () => {
        const failure = new Error('earth engine unavailable')
        const {observer, states, subjectOf} = observerOver()
        observer.observe(chain())
        subjectOf(recipeReference('inner')).error(failure)

        const published = latest(states)
        expect(published).toEqual(state({status: 'UNAVAILABLE', error: failure}))
        expect(published.error).toBe(failure)
    })

    it('tears down siblings still in flight and never terminates the observer', () => {
        const {observer, states, torndown, terminated, subjectOf, emit} = observerOver()
        observer.observe(twoBranches())
        subjectOf(recipeReference('a')).error(new Error('failed'))

        expect([...torndown].sort()).toEqual(['RECIPE_REF:a', 'RECIPE_REF:b'])
        expect(terminated()).toBe(null)

        observer.observe(chain())
        emit(recipeReference('inner'), ['class'])
        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('class', 'mode')])
        }))
    })
})

describe('observations are attached to their own reference', () => {
    it('keeps out-of-order completions attached correctly', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(twoBranches())
        emit(recipeReference('b'), ['class'])
        emit(recipeReference('a'), ['VV'])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('VV', 'sample'), band('class', 'mode')])
        }))
    })

    it('observes a shared reference once across a diamond', () => {
        const {observer, requests, emit} = observerOver()
        observer.observe(graph({
            recipes: [
                node('root', COMBINE),
                node('a', PASS_THROUGH),
                node('shared', SAMPLED),
                node('b', PASS_THROUGH)
            ],
            edges: [
                edge('root', 'left', recipeReference('a')),
                edge('root', 'right', recipeReference('b')),
                edge('a', 'image', recipeReference('shared')),
                edge('b', 'image', recipeReference('shared'))
            ]
        }))
        emit(recipeReference('shared'), ['VV'])

        expect(requests.filter(({reference: {id}}) => id === 'shared')).toHaveLength(1)
    })

    it('observes a shared asset once when two edges select it', () => {
        const leaf = assetReference('users/x/leaf')
        const {observer, requests} = observerOver()
        observer.observe(graph({
            recipes: [node('root', COMBINE)],
            edges: [
                edge('root', 'left', leaf),
                edge('root', 'right', leaf)
            ]
        }))

        expect(requests).toEqual([{reference: leaf}])
    })

    // A replaced observation is unsubscribed, and a closed subscriber cannot publish. No epoch is
    // involved: unsubscription is the entire mechanism at this boundary.
    it('cannot be published by an observation that was replaced', () => {
        const {observer, states, torndown, subjectsByKey, subjectOf, emit} = observerOver()
        const replaced = subjectOf(recipeReference('inner'))
        observer.observe(chain())
        expect(torndown).toEqual([])

        delete subjectsByKey['RECIPE_REF:inner']
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH), node('inner', SAMPLED)],
            edges: [edge('root', 'image', recipeReference('inner'))]
        }))
        // Torn down as observe() replaces it, not merely suppressed when it later emits.
        expect(torndown).toEqual(['RECIPE_REF:inner'])

        emit(recipeReference('inner'), ['VV'])
        const current = latest(states)

        replaced.next(['class', 'probability'])
        replaced.complete()
        expect(current).toEqual(state({
            status: 'READY',
            description: described('root', [band('VV', 'sample')])
        }))
        expect(latest(states)).toBe(current)
    })
})

describe('synchronous reentrancy', () => {
    it('never starts an observation superseded by a switch on loading', () => {
        const {observer, states, requests, torndown} = observerOver()
        let switched = false
        observer.state$.subscribe(({status}) => {
            if (status === 'LOADING' && !switched) {
                switched = true
                observer.observe(twoBranches())
            }
        })
        observer.observe(chain())

        expect(requests.map(({reference}) => reference))
            .toEqual([recipeReference('a'), recipeReference('b')])
        expect(requests.map(({reference: {id}}) => id)).not.toContain('inner')

        observer.cancel()
        expect([...torndown].sort()).toEqual(['RECIPE_REF:a', 'RECIPE_REF:b'])
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
    })

    it('keeps an observation started synchronously from a ready notification', () => {
        const {observer, states, torndown} = observerOver({synchronous: {'RECIPE_REF:first': ['VV']}})
        let restarted = false
        observer.state$.subscribe(({status}) => {
            if (status === 'READY' && !restarted) {
                restarted = true
                observer.observe(twoBranches())
            }
        })
        observer.observe(graph({recipes: [node('first', SAMPLED)]}))

        expect(latest(states)).toEqual(state({status: 'LOADING'}))
        expect(torndown).toContain('RECIPE_REF:first')
        expect(torndown).not.toContain('RECIPE_REF:a')

        observer.cancel()
        expect([...torndown].sort()).toEqual(['RECIPE_REF:a', 'RECIPE_REF:b', 'RECIPE_REF:first'])
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
    })
})

describe('assets carry no guessed policy', () => {
    it('reports an observed asset without a policy as unresolved, not malformed', () => {
        const leaf = assetReference('users/x/leaf')
        const {observer, states, emit} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'image', leaf)]
        }))
        emit(leaf, ['B1'])

        expect(latest(states)).toEqual(state({
            status: 'UNAVAILABLE',
            diagnostics: [{
                code: 'INCOMPLETE_IMAGE_OUTPUT',
                path: ['bands', 0, 'pyramidingPolicy'],
                recipePath: ['root'],
                reference: leaf
            }]
        }))
    })
})

describe('graph and resolver classification', () => {
    it('is invalid for a malformed asset observation, which is wrong rather than unknown', () => {
        const leaf = assetReference('users/x/leaf')
        const {observer, states, emit} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'image', leaf)]
        }))
        emit(leaf, ['B1', 'B1'])

        // Two of the three are unresolved asset incompleteness; the duplicate name is definitively
        // wrong, and one definitive diagnosis is enough to make the whole state invalid.
        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'pyramidingPolicy'], recipePath: ['root'], reference: leaf},
                {code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root'], reference: leaf},
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 1, 'pyramidingPolicy'], recipePath: ['root'], reference: leaf}
            ]
        }))
    })

    // The GUI catalogue is reference-counted and drops an entry when the last component using it
    // unmounts, so a referenced recipe missing from it is routinely still saved and merely not loaded.
    const missingSource = {
        code: 'MISSING_SOURCE',
        role: 'image',
        path: ['model', 'image'],
        recipePath: ['root', 'elsewhere']
    }
    const cyclic = {
        code: 'CYCLIC_DEPENDENCY',
        role: 'image',
        path: ['model', 'image'],
        recipePath: ['root', 'root']
    }
    const brokenGraph = diagnostics => graph({
        recipes: [node('root', PASS_THROUGH), node('inner', CLASS_BASED)],
        edges: [edge('root', 'image', recipeReference('inner'))],
        diagnostics
    })

    it('treats an unloaded reference as unavailable, never as a deleted recipe', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(brokenGraph([missingSource]))

        expect(latest(states)).toEqual(state({status: 'UNAVAILABLE', diagnostics: [missingSource]}))
        expect(requests).toEqual([])
    })

    it('treats a definitive graph diagnosis as invalid, preserving it verbatim', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(brokenGraph([cyclic]))

        expect(latest(states)).toEqual(state({status: 'INVALID', diagnostics: [cyclic]}))
        expect(requests).toEqual([])
    })

    it('is invalid when a definitive diagnosis accompanies a missing source, in graph order', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(brokenGraph([missingSource, cyclic]))

        expect(latest(states)).toEqual(state({status: 'INVALID', diagnostics: [missingSource, cyclic]}))
        expect(requests).toEqual([])
    })

    it('is invalid for a loaded recipe whose type declares no output, without observing it', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(graph({recipes: [node('root', UNDECLARED)]}))

        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [{code: 'UNDECLARED_OUTPUT', path: [], recipePath: ['root']}]
        }))
        expect(requests).toEqual([])
    })

    it('is invalid when a declaration produces a malformed candidate', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(graph({recipes: [node('root', DUPLICATING)]}))
        emit(recipeReference('root'), ['a', 'b'])

        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [{code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root']}]
        }))
    })
})

describe('descriptions stay outside recipes', () => {
    it('never writes evidence into the recipe objects it was given', () => {
        const recipes = [node('root', PASS_THROUGH), node('inner', SAMPLED)]
        const before = JSON.stringify(recipes)
        const {observer, states, emit} = observerOver()
        observer.observe(graph({
            recipes,
            edges: [edge('root', 'image', recipeReference('inner'))]
        }))
        emit(recipeReference('inner'), ['VV'])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('VV', 'sample')])
        }))
        expect(JSON.stringify(recipes)).toEqual(before)
        expect(Object.keys(recipes[0])).toEqual(['id', 'type'])
        expect(Object.keys(recipes[1])).toEqual(['id', 'type'])
    })
})
