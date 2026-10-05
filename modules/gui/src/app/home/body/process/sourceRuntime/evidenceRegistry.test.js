import {of, Subject, switchMap, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Keeping a recipe's evidence about its source current while it is watched: what is asked, when it is asked again,
// and what is done with the answer.
//
// Masking's real observation is what is observed, watched as its editor watches it. Whatever it reads is behind
// `read$`, which stands for its request: when the lifecycle observes, what it answers and when, or that it fails. The
// session is the props a test gives, replaced between updates the way the store replaces its state, and what the
// registry writes is recorded rather than applied.

const bands$ = vi.fn()
const assetMetadata$ = vi.fn()
const read$ = vi.fn()
const recipeLoad$ = vi.fn()

vi.mock('~/apiRegistry', () => ({
    default: {
        gee: {bands$: (...args) => bands$(...args), assetMetadata$: (...args) => assetMetadata$(...args)},
        recipe: {load$: (...args) => recipeLoad$(...args)}
    }
}))

vi.mock('../recipeTypeRegistry', () => ({
    getRecipeType: () => ({getPreSetVisualizations: recipe => recipe.model.presets || []})
}))

const styled = (recipe, own) => ({...recipe, layers: {userDefinedVisualizations: {'this-recipe': own}}})

const {EvidenceRegistry} = await import('./evidenceRegistry')
const {RecipeCacheClaimant} = await import('../recipeCacheClaims')
const {maskingObservation} = await import('../recipe/masking/maskingSourceEvidence')

const observation = {
    ...maskingObservation,
    observe$: args => read$(args).pipe(switchMap(() => maskingObservation.observe$(args)))
}

const CCDC_PRESETS = [{id: 'v-red', bands: ['red']}]

const recipeSelection = id => ({type: 'RECIPE_REF', id})

const maskingRecipe = ({primary, sourceEvidence} = {}) => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: primary},
    ...(sourceEvidence ? {ui: {sourceEvidence}} : {})
})

const ccdcRecipe = (id, presets = CCDC_PRESETS) => ({id, type: 'CCDC', model: {presets}})

// The evidence the lifecycle published, apart from its marks that it is reading again and the observation it was
// published by.
const published = writes => writes
    .filter(({path}) => path === 'ui.sourceEvidence')
    .map(({value: {observationId: _observationId, ...evidence}}) => evidence)

const sync = props => {
    const dispatched = []
    const changes$ = new Subject()
    let current = {
        loadedRecipes: {},
        catalogue: [],
        openRecipeIds: [],
        saves: {},
        assetEvidence: {},
        sourceRefreshes: {},
        earthEngineGeneration: {},
        loadRecipe$: id => of(ccdcRecipe(id)),
        reloadRecipe$: id => of(ccdcRecipe(id)),
        ...props
    }
    const registry = new EvidenceRegistry({
        session: () => ({
            loadedRecipes: {...current.loadedRecipes, [current.recipe.id]: current.recipe},
            catalogue: current.catalogue,
            openRecipeIds: current.openRecipeIds,
            saves: current.saves,
            assetEvidence: current.assetEvidence,
            sourceRefreshes: current.sourceRefreshes,
            earthEngineGeneration: current.earthEngineGeneration
        }),
        sessionChanges$: changes$,
        claimRecords: () => current.sessionCache
            ? new RecipeCacheClaimant(sessionCache)
            : {use: () => {}, load$: id => current.loadRecipe$(id), reload$: id => current.reloadRecipe$(id), release: () => {}},
        claimAssets: ids => current.claimAssets?.(ids) || (() => {}),
        write: ({writes}) => {
            dispatched.push(...writes)
            current.onWrite?.()
            return true
        }
    })
    let subscription = null
    const watch = {
        start: () => subscription = registry.watch$({recipeId: current.recipe.id, observation}).subscribe(),
        stop: () => subscription.unsubscribe()
    }
    const rerender = next => {
        current = {...current, ...next}
        changes$.next()
    }
    // With `sessionCache`, the watch claims `loadedRecipes` as the session's recipe cache, as components do.
    const sessionCache = {
        held: id => current.loadedRecipes[id],
        open: id => current.openRecipeIds.includes(id),
        saveState: id => current.saves[id],
        write: record => rerender({loadedRecipes: {...current.loadedRecipes, [record.id]: record}}),
        remove: id => {
            const {[id]: _removed, ...rest} = current.loadedRecipes
            rerender({loadedRecipes: rest})
        }
    }
    return {
        watch,
        registry,
        dispatched,
        rerender,
        evidence: () => published(dispatched),
        cached: () => current.loadedRecipes,
        cacheClaimant: () => new RecipeCacheClaimant(sessionCache)
    }
}

beforeEach(() => {
    bands$.mockReset()
    assetMetadata$.mockReset()
    recipeLoad$.mockReset()
    read$.mockReset()
    read$.mockReturnValue(of(null))
})

describe('observing a recipe source', () => {
    it('asks Earth Engine nothing, since the source\'s bands are Masking\'s description\'s', () => {
        const {watch, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadRecipe$: () => of(ccdcRecipe('source-1'))
        })

        watch.start()

        expect(bands$).not.toHaveBeenCalled()
        expect(evidence()).toEqual([{
            sourceKey: 'RECIPE_REF:source-1',
            status: 'OBSERVED',
            visualizations: CCDC_PRESETS
        }])
    })

    it('takes the presets from the source recipe, which Earth Engine knows nothing about', () => {
        const {watch, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadRecipe$: () => of(ccdcRecipe('source-1'))
        })

        watch.start()

        expect(evidence()[0].visualizations).toEqual(CCDC_PRESETS)
    })
})

// The source is edited while the consumer is open. Nothing is copied, so the next look reports what the
// source says now - added, changed or gone.
describe('a style added, edited and deleted on the source', () => {
    const withOwn = own => styled(ccdcRecipe('source-1', []), own)
    const RATIO = {id: 'v-ratio', bands: ['ratio'], type: 'continuous', userDefined: true}

    const editing = () => {
        const {watch, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {'source-1': withOwn([])},
            loadRecipe$: () => of(withOwn([]))
        })
        watch.start()
        return {rerender, evidence, latest: () => evidence().at(-1).visualizations}
    }

    const editSource = (rerender, own) => rerender({
        loadedRecipes: {'source-1': withOwn(own)},
        loadRecipe$: () => of(withOwn(own))
    })

    it('offers the addition without the recipe being reopened', () => {
        const {rerender, latest} = editing()

        editSource(rerender, [RATIO])

        expect(latest()).toEqual([{id: 'v-ratio', bands: ['ratio'], type: 'continuous'}])
    })

    it('follows an edit to it, keeping the identity a selection names', () => {
        const {rerender, latest} = editing()
        editSource(rerender, [RATIO])

        editSource(rerender, [{...RATIO, palette: ['#000', '#fff']}])

        expect(latest()).toEqual([
            {id: 'v-ratio', bands: ['ratio'], type: 'continuous', palette: ['#000', '#fff']}
        ])
    })

    it('stops offering it once the source deletes it', () => {
        const {rerender, latest} = editing()
        editSource(rerender, [RATIO])

        editSource(rerender, [])

        expect(latest()).toEqual([])
    })
})

// A wrapper has no presets of its own, and the one it copied is exactly the stale snapshot this mechanism
// replaces. The declared chain is followed to whatever actually owns them.
describe('observing a wrapper around another wrapper', () => {
    const nested = () => {
        const inner = {
            id: 'inner',
            type: 'MASKING',
            model: {imageToMask: {...recipeSelection('source-1'), visualizations: [{id: 'stale', bands: ['gone']}]}}
        }
        const records = {inner, 'source-1': ccdcRecipe('source-1')}
        return {
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadRecipe$: id => of(records[id])
        }
    }

    it('takes presets from the recipe that owns them, not the wrapper in between', () => {
        const {watch, evidence} = sync(nested())

        watch.start()

        expect(evidence()[0].visualizations).toEqual(CCDC_PRESETS)
    })

    // The shared graph is the authority on cycles, and a graph that cannot run has no evidence to give.
    // The wrapper in between can be styled too, and those styles describe its output - which, because it
    // preserves what it wraps, is also this recipe's. What it copied when its own source was selected is
    // the stale snapshot, and stays out.
    it('takes styles the wrapper owns, without reviving the presets it copied', () => {
        const inner = styled({
            id: 'inner',
            type: 'MASKING',
            model: {imageToMask: {...recipeSelection('source-1'), visualizations: [{id: 'stale', bands: ['gone']}]}}
        }, [{id: 'v-inner', bands: ['red'], type: 'continuous', userDefined: true}])
        const records = {inner, 'source-1': ccdcRecipe('source-1', CCDC_PRESETS)}
        const {watch, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadRecipe$: id => of(records[id])
        })

        watch.start()

        expect(evidence()[0].visualizations).toEqual([
            {id: 'v-inner', bands: ['red'], type: 'continuous'},
            ...CCDC_PRESETS
        ])
    })

    it('reports a cyclic chain as unavailable rather than following it', () => {
        const looping = {id: 'looping', type: 'MASKING', model: {imageToMask: recipeSelection('looping')}}
        const {watch, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('looping')}),
            loadRecipe$: () => of(looping)
        })

        watch.start()

        expect(evidence()[0].status).toBe('UNAVAILABLE')
        expect(read$).not.toHaveBeenCalled()
    })
})

describe('observing an asset source', () => {
    it('reads its presentation through metadata, and never its schema', () => {
        assetMetadata$.mockReturnValue(of({bandNames: ['B1'], properties: {}}))
        const {watch, evidence} = sync({
            recipe: maskingRecipe({primary: {type: 'ASSET', id: 'users/bob/image'}})
        })

        watch.start()

        expect(assetMetadata$).toHaveBeenCalledWith({asset: 'users/bob/image'})
        expect(bands$).not.toHaveBeenCalled()
        expect(evidence()).toEqual([expect.objectContaining({status: 'OBSERVED'})])
        expect(evidence()[0]).not.toHaveProperty('bands')
    })
})

// An answer describes a source as it was when it was asked about. What governs a second look is therefore
// everything that could change the answer, not the source's identity - which never changes when the source
// itself is edited.
describe('asking again', () => {
    const observing = extra => {
        const source = ccdcRecipe('source-1')
        return {
            source,
            ...sync({
                recipe: maskingRecipe({primary: recipeSelection('source-1')}),
                loadedRecipes: {'source-1': source},
                loadRecipe$: id => (id === 'source-1' ? of(source) : of(ccdcRecipe(id))),
                ...extra
            })
        }
    }

    it('does not happen on an unrelated rerender', () => {
        const {watch, rerender} = observing()
        watch.start()

        rerender({})
        rerender({})

        expect(read$).toHaveBeenCalledTimes(1)
    })

    it('does not happen because the watch\'s own load reached the catalogue', () => {
        const source = ccdcRecipe('source-1')
        const {watch, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {},
            loadRecipe$: () => of(source)
        })
        watch.start()

        rerender({loadedRecipes: {'source-1': source}})

        expect(read$).toHaveBeenCalledTimes(1)
    })

    it('happens when that record is then edited', () => {
        const source = ccdcRecipe('source-1')
        const {watch, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {},
            loadRecipe$: () => of(source)
        })
        watch.start()
        rerender({loadedRecipes: {'source-1': source}})

        rerender({loadedRecipes: {'source-1': ccdcRecipe('source-1', [{id: 'v-nir', bands: ['nir']}])}})

        expect(read$).toHaveBeenCalledTimes(2)
    })

    it('happens when the source recipe is edited in the session', () => {
        const {watch, rerender} = observing()
        watch.start()

        rerender({loadedRecipes: {'source-1': ccdcRecipe('source-1', [{id: 'v-nir', bands: ['nir']}])}})

        expect(read$).toHaveBeenCalledTimes(2)
    })

    it('happens when the panel applies refreshed data over the same source', () => {
        const {watch, rerender} = observing()
        watch.start()

        rerender({
            recipe: maskingRecipe({primary: {...recipeSelection('source-1'), bands: ['red', 'nir']}})
        })

        expect(read$).toHaveBeenCalledTimes(2)
    })

    it('happens when a recipe deeper in the chain is edited', () => {
        const inner = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('source-1')}}
        const records = {inner, 'source-1': ccdcRecipe('source-1')}
        const {watch, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: records,
            loadRecipe$: id => of(records[id])
        })
        watch.start()
        rerender({})

        rerender({
            loadedRecipes: {...records, 'source-1': ccdcRecipe('source-1', [{id: 'v-nir', bands: ['nir']}])}
        })

        expect(read$).toHaveBeenCalledTimes(2)
    })

    // A source edited in another session is never in this one's cache, so the catalogue revision is the only
    // thing that can say it changed.
    it('happens when the catalogue revision of a chain recipe advances', () => {
        const {watch, rerender} = observing({catalogue: [{id: 'source-1', revision: 3}]})
        watch.start()
        rerender({})

        rerender({catalogue: [{id: 'source-1', revision: 4}]})

        expect(read$).toHaveBeenCalledTimes(2)
    })

    it('does not happen when an unrelated recipe advances', () => {
        const {watch, rerender} = observing({catalogue: [{id: 'source-1', revision: 3}]})
        watch.start()
        rerender({})

        rerender({catalogue: [{id: 'source-1', revision: 3}, {id: 'elsewhere', revision: 9}]})

        expect(read$).toHaveBeenCalledTimes(1)
    })

    it('happens when the Earth Engine identity is replaced', () => {
        const {watch, rerender} = observing()
        watch.start()

        rerender({earthEngineGeneration: {}})

        expect(read$).toHaveBeenCalledTimes(2)
    })

    it('happens when the selection changes to another source', () => {
        const {watch, rerender} = observing()
        watch.start()

        rerender({recipe: maskingRecipe({primary: recipeSelection('source-2')})})

        expect(read$).toHaveBeenCalledTimes(2)
    })

    it('does not happen merely because an earlier attempt failed', () => {
        read$.mockReturnValue(throwError(() => new Error('unreachable')))
        const source = ccdcRecipe('source-1')
        const {watch, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {'source-1': source},
            loadRecipe$: () => of(source)
        })

        watch.start()
        rerender({})

        expect(read$).toHaveBeenCalledTimes(1)
    })
})

// A source that cannot be reached is recorded as such. Leaving no evidence at all would let consumers keep
// presenting the bands a saved recipe remembers as though they were current.
describe('an observation that fails', () => {
    it('records the source as unavailable rather than leaving the recipe on its snapshot', () => {
        read$.mockReturnValue(throwError(() => new Error('unreachable')))
        const {watch, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadRecipe$: () => of(ccdcRecipe('source-1'))
        })

        watch.start()

        expect(evidence()).toEqual([expect.objectContaining({
            sourceKey: 'RECIPE_REF:source-1',
            status: 'UNAVAILABLE'
        })])
    })
})

describe('an answer for a source that is no longer selected', () => {
    it('is not written', () => {
        const answer = new Subject()
        read$.mockReturnValue(answer)
        const {watch, dispatched, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadRecipe$: () => of(ccdcRecipe('source-1'))
        })
        watch.start()

        rerender({recipe: maskingRecipe({primary: recipeSelection('source-2')})})
        answer.next(['stale'])

        expect(dispatched.filter(({value}) => value.sourceKey === 'RECIPE_REF:source-1')).toEqual([])
    })
})

// Everything the registry writes can notify the store again, synchronously, before the write returns.
describe('an update the registry\'s own writes cause', () => {
    const watching = extra => sync({
        recipe: maskingRecipe({primary: recipeSelection('source-1')}),
        loadedRecipes: {'source-1': ccdcRecipe('source-1')},
        ...extra
    })

    it('starts no second observation, and the answer is published once', () => {
        const harness = watching()
        harness.rerender({onWrite: () => harness.rerender({})})

        harness.watch.start()

        expect(read$).toHaveBeenCalledTimes(1)
        expect(harness.evidence()).toHaveLength(1)
    })

    it('brings back nothing released while it was publishing, however the store is notified', () => {
        const answer = new Subject()
        read$.mockReturnValue(answer)
        const harness = watching()
        harness.watch.start()
        harness.rerender({onWrite: () => {
            harness.watch.stop()
            harness.rerender({})
        }})

        answer.next(null)
        harness.rerender({onWrite: null})

        expect(harness.evidence()).toHaveLength(1)
        expect(harness.registry.ownerOf('masked-1')).toBe(null)
        expect(read$).toHaveBeenCalledTimes(1)
    })
})

describe('a recipe that needs no observation', () => {
    it('observes nothing when it inherits no schema', () => {
        const {watch, dispatched} = sync({recipe: {id: 'ccdc-1', type: 'CCDC', model: {}}})

        watch.start()

        expect(read$).not.toHaveBeenCalled()
        expect(assetMetadata$).not.toHaveBeenCalled()
        expect(dispatched).toEqual([])
    })

    it('observes nothing when no source is selected', () => {
        const {watch} = sync({recipe: maskingRecipe()})

        watch.start()

        expect(read$).not.toHaveBeenCalled()
    })
})

// A revision advancing is only evidence that the session's copy is behind. Observing again while still
// reading that copy answers with the same content it already had.
describe('a dependency the catalogue has moved past', () => {
    const behind = ccdcRecipe('source-1', [{id: 'v-old', bands: ['red']}])
    const ahead = ccdcRecipe('source-1', [{id: 'v-new', bands: ['nir']}])

    const observing = ({openRecipeIds = [], saves = {}} = {}) => {
        const reloadRecipe$ = vi.fn(() => of({...ahead, revision: 4}))
        return {
            reloadRecipe$,
            ...sync({
                recipe: maskingRecipe({primary: recipeSelection('source-1')}),
                loadedRecipes: {'source-1': {...behind, revision: 3}},
                catalogue: [{id: 'source-1', revision: 4}],
                openRecipeIds,
                saves,
                loadRecipe$: () => of({...behind, revision: 3}),
                reloadRecipe$
            })
        }
    }

    it('is read again rather than answered from the copy the session holds', () => {
        const {watch, reloadRecipe$} = observing()

        watch.start()

        expect(reloadRecipe$).toHaveBeenCalledWith('source-1')
    })

    it('publishes what the newer revision says, not what the stale copy said', () => {
        const {watch, evidence} = observing()

        watch.start()

        expect(evidence()[0].visualizations).toEqual([{id: 'v-new', bands: ['nir']}])
    })

    // An open recipe's cached entry is a draft. Whatever is persisted must not replace unsaved work.
    it('is left alone when it was closed with its save still outstanding', () => {
        const {watch, evidence, reloadRecipe$} = observing({saves: {'source-1': {status: 'SAVING'}}})

        watch.start()

        expect(reloadRecipe$).not.toHaveBeenCalled()
        expect(evidence()[0].visualizations).toEqual([{id: 'v-old', bands: ['red']}])
    })

    it('is left alone when it is open for editing', () => {
        const {watch, evidence, reloadRecipe$} = observing({openRecipeIds: ['source-1']})

        watch.start()

        expect(reloadRecipe$).not.toHaveBeenCalled()
        expect(evidence()[0].visualizations).toEqual([{id: 'v-old', bands: ['red']}])
    })
})

// The dependencies an answer was read from are known once the closure resolves, not once the answer
// arrives. Between those two moments the source can change, and the answer describes what it no longer is.
describe('a change while an observation is in flight', () => {
    const inner = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('source-1')}}
    const records = {inner, 'source-1': ccdcRecipe('source-1', [{id: 'v-old', bands: ['red']}])}
    const edited = {...records, 'source-1': ccdcRecipe('source-1', [{id: 'v-new', bands: ['nir']}])}

    it('keeps the pending read and publishes its answer after a UI-only edit', () => {
        const held = new Subject()
        read$.mockReturnValueOnce(held).mockReturnValue(of(['unexpected-restart']))
        const {watch, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: records
        })
        watch.start()

        rerender({loadedRecipes: {
            ...records,
            'source-1': {...records['source-1'], ui: {dates: {endDate: '2022-01-01', dirty: true}}}
        }})
        held.next(['red'])
        held.complete()

        expect(read$).toHaveBeenCalledTimes(1)
        expect(evidence()).toEqual([expect.objectContaining({
            status: 'OBSERVED',
            visualizations: records['source-1'].model.presets
        })])
    })

    // The first response is held open, the terminal source is edited, and only then does it arrive. Both
    // responses complete, so what is asserted is what actually reached the recipe.
    const raced = () => {
        const held = new Subject()
        read$.mockReturnValueOnce(held).mockReturnValue(of(['red']))
        const {watch, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: records,
            loadRecipe$: id => of(records[id])
        })
        watch.start()

        rerender({loadedRecipes: edited, loadRecipe$: id => of(edited[id])})
        held.next(['red'])
        held.complete()

        return evidence()
    }

    it('publishes what the edited source says', () => {
        expect(raced().map(({visualizations}) => visualizations))
            .toEqual([[{id: 'v-new', bands: ['nir']}]])
    })

    it('never publishes the answer that was already being read', () => {
        expect(raced().some(({visualizations}) => visualizations.some(({id}) => id === 'v-old'))).toBe(false)
    })
})

// The same race, but during CLOSURE LOADING rather than during the band request. The answer is read from
// the chain the closure resolves; while some other dependency is still being loaded, that chain can change
// underneath it. What the operation started from has to be remembered from the start, not read back at the
// end - by then the session has already moved.
describe('a change while a dependency is still loading', () => {
    const inner = {
        id: 'inner',
        type: 'MASKING',
        model: {imageToMask: recipeSelection('source-1'), imageMask: recipeSelection('mask-1')}
    }
    const atStart = {inner, 'source-1': ccdcRecipe('source-1', [{id: 'v-old', bands: ['red']}])}
    const edited = {...atStart, 'source-1': ccdcRecipe('source-1', [{id: 'v-new', bands: ['nir']}])}

    it('accepts the completed closure after a source panel changes only its draft', () => {
        const mask = new Subject()
        const {watch, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection(inner.id)}),
            loadedRecipes: atStart,
            loadRecipe$: () => mask
        })
        watch.start()

        rerender({loadedRecipes: {
            ...atStart,
            inner: {...inner, ui: {dirty: true}},
            'source-1': {...atStart['source-1'], ui: {dates: {dirty: true}}}
        }})
        mask.next(ccdcRecipe('mask-1'))
        mask.complete()

        expect(evidence()).toEqual([expect.objectContaining({
            status: 'OBSERVED',
            visualizations: atStart['source-1'].model.presets
        })])
    })

    // The mask's load is held open. While it is pending the terminal recipe is edited, and only then does
    // the mask arrive and let the closure complete.
    const raced = () => {
        const mask = new Subject()
        const {watch, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection(inner.id)}),
            loadedRecipes: atStart,
            loadRecipe$: id => (id === 'mask-1' ? mask : of(atStart[id]))
        })
        watch.start()

        // The pending operation keeps the loader it started with; a later one reads the mask normally.
        rerender({
            loadedRecipes: edited,
            loadRecipe$: id => of(id === 'mask-1' ? ccdcRecipe('mask-1') : edited[id])
        })
        mask.next(ccdcRecipe('mask-1'))
        mask.complete()

        return {evidence, rerender}
    }

    it('does not publish presets read from the version the edit replaced', () => {
        const {evidence} = raced()

        expect(evidence().some(({visualizations}) =>
            visualizations.some(({id}) => id === 'v-old'))).toBe(false)
    })

    it('publishes what the edited recipe says once it looks again', () => {
        const {evidence, rerender} = raced()

        rerender({})

        expect(evidence().at(-1).visualizations).toEqual([{id: 'v-new', bands: ['nir']}])
    })
})

// A record read after the catalogue was listed is newer than the summary, not behind it.
describe('a dependency newer than the catalogue summary', () => {
    it('is neither reloaded nor observed twice', () => {
        const reloadRecipe$ = vi.fn(() => of(ccdcRecipe('source-1')))
        const {watch, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {'source-1': {...ccdcRecipe('source-1'), revision: 5}},
            catalogue: [{id: 'source-1', revision: 4}],
            reloadRecipe$
        })

        watch.start()
        rerender({})
        rerender({})

        expect(reloadRecipe$).not.toHaveBeenCalled()
        expect(read$).toHaveBeenCalledTimes(1)
    })
})

// A broken graph was still read from records, and repairing one of them is what makes it answerable.
// A component caches what it reads and the watch reads what is cached; both keep it while they need it.
describe('a record the session already held when the watch read it', () => {
    const inner = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('source-1')}}
    const watching = primary => {
        const harness = sync({
            recipe: maskingRecipe({primary}),
            loadedRecipes: {inner, 'source-1': ccdcRecipe('source-1')},
            sessionCache: true
        })
        const component = harness.cacheClaimant()
        component.use('inner')
        component.use('source-1')
        return {...harness, component}
    }

    const releasing = []
    afterEach(() => releasing.splice(0).forEach(({watch, component}) => {
        component.release()
        watch.stop()
    }))

    it.each([
        ['the selected source', recipeSelection('source-1')],
        ['a recipe deeper in the chain', recipeSelection('inner')]
    ])('stays cached for the watch once the component that cached it leaves, as %s', (_case, primary) => {
        const harness = watching(primary)
        releasing.push(harness)
        harness.watch.start()

        harness.component.release()

        expect(harness.cached()).toHaveProperty('source-1')
        expect(recipeLoad$).not.toHaveBeenCalled()
    })

    it('is removed once the watch has gone too', () => {
        const harness = watching(recipeSelection('inner'))
        harness.watch.start()
        harness.component.release()

        harness.watch.stop()

        expect(harness.cached()).toEqual({})
    })
})

describe('a cycle deeper in the chain', () => {
    const cyclic = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('inner')}}
    const repaired = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('source-1')}}

    it('is observed again once the deeper recipe is repaired', () => {
        const {watch, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: {inner: cyclic},
            loadRecipe$: id => of(id === 'inner' ? cyclic : ccdcRecipe(id))
        })
        watch.start()
        expect(evidence()[0].status).toBe('UNAVAILABLE')

        rerender({
            loadedRecipes: {inner: repaired, 'source-1': ccdcRecipe('source-1')},
            loadRecipe$: id => of(id === 'inner' ? repaired : ccdcRecipe(id))
        })

        expect(evidence()[1].status).toBe('OBSERVED')
    })
})

// Loading continues past a cycle to a branch still missing, and that read can fail. The records read before the
// failure are still what a repair would change, so the failure keeps them as its basis.
describe('a cycle deeper in the chain beside a dependency that cannot be read', () => {
    const outer = {id: 'outer', type: 'MASKING', model: {imageToMask: recipeSelection('inner'), imageMask: recipeSelection('gone')}}
    const cyclic = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('inner')}}
    const repaired = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('source-1')}}

    const failing = () => {
        const loads = []
        const loadRecipe$ = id => {
            loads.push(id)
            return id === 'gone' ? throwError(() => new Error('no such recipe')) : of(ccdcRecipe(id))
        }
        return {loads, loadRecipe$}
    }

    it('is observed again once a recipe it had read is repaired', () => {
        const {loadRecipe$} = failing()
        const {watch, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('outer')}),
            loadedRecipes: {outer, inner: cyclic},
            loadRecipe$
        })
        watch.start()
        expect(evidence()[0].status).toBe('UNAVAILABLE')

        rerender({
            loadedRecipes: {outer, inner: repaired, 'source-1': ccdcRecipe('source-1')},
            loadRecipe$: id => of(ccdcRecipe(id))
        })

        expect(evidence()[1].status).toBe('OBSERVED')
    })

    it('does not read again merely because the attempt failed', () => {
        const {loads, loadRecipe$} = failing()
        const {watch, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('outer')}),
            loadedRecipes: {outer, inner: cyclic},
            loadRecipe$
        })
        watch.start()
        rerender({})

        expect(loads.filter(id => id === 'gone')).toHaveLength(1)
    })
})

describe('a selected source with a missing mask', () => {
    const withMask = mask => ({
        id: 'inner',
        type: 'MASKING',
        model: {imageToMask: recipeSelection('source-1'), imageMask: mask}
    })

    it('is observed again after a missing one made the source unavailable', () => {
        const {watch, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: {inner: withMask(recipeSelection('gone'))},
            loadRecipe$: id => (id === 'gone'
                ? throwError(() => new Error('no such recipe'))
                : of(ccdcRecipe(id)))
        })
        watch.start()
        expect(evidence()[0].status).toBe('UNAVAILABLE')

        rerender({
            loadedRecipes: {inner: withMask(recipeSelection('good-mask'))},
            loadRecipe$: id => of(ccdcRecipe(id))
        })

        expect(evidence()[1].status).toBe('OBSERVED')
    })
})

describe('a consumer with a missing mask', () => {
    it('still observes the selected source', () => {
        const {watch, evidence} = sync({
            recipe: {
                ...maskingRecipe({primary: recipeSelection('source-1')}),
                model: {imageToMask: recipeSelection('source-1'), imageMask: recipeSelection('gone')}
            },
            loadRecipe$: id => id === 'gone'
                ? throwError(() => new Error('no such recipe'))
                : of(ccdcRecipe(id))
        })

        watch.start()

        expect(evidence()).toEqual([expect.objectContaining({
            status: 'OBSERVED',
            visualizations: CCDC_PRESETS
        })])
    })
})

// Earth Engine has no revision. The token the source runtime reads for an asset is what says it has changed.
describe('an asset source', () => {
    const observing = (assetEvidence, assetId = 'users/bob/image') => {
        assetMetadata$.mockReturnValue(of({bandNames: ['B1'], properties: {}}))
        return sync({
            recipe: maskingRecipe({primary: {type: 'ASSET', id: assetId}}),
            assetEvidence
        })
    }

    it('is observed again when its token changes', () => {
        const {watch, rerender} = observing({['users/bob/image']: {version: '2026-01-01T00:00:00.000001Z', checkedAt: 0}})
        watch.start()
        rerender({})

        rerender({assetEvidence: {['users/bob/image']: {version: '2026-01-01T00:00:00.000002Z', checkedAt: 0}}})

        expect(read$).toHaveBeenCalledTimes(2)
    })

    it('is not observed again when its first token is learned after it was read', () => {
        const {watch, rerender} = observing({})
        watch.start()

        rerender({assetEvidence: {'users/bob/image': {version: 'v1', checkedAt: 0}}})
        rerender({})

        expect(read$).toHaveBeenCalledTimes(1)
    })

    it('is observed again once it is explicitly refreshed, and once the recipe reading it is', () => {
        const {watch, rerender} = observing({'users/bob/image': {version: 'v1', checkedAt: 0}})
        watch.start()

        rerender({sourceRefreshes: {assets: {'users/bob/image': 1}}})
        rerender({sourceRefreshes: {assets: {'users/bob/image': 1}, recipes: {'masked-1': 1}}})

        expect(read$).toHaveBeenCalledTimes(3)
    })

    it('without a token is observed again once what was read from it is half an hour old, and not before', () => {
        vi.useFakeTimers()
        try {
            const {watch} = observing({'gs://bucket/image.tif': {version: null, unversioned: true, checkedAt: 0}}, 'gs://bucket/image.tif')
            watch.start()

            vi.advanceTimersByTime(30 * 60 * 1000 - 1)
            expect(read$).toHaveBeenCalledTimes(1)
            vi.advanceTimersByTime(1)

            expect(read$).toHaveBeenCalledTimes(2)
        } finally {
            vi.useRealTimers()
        }
    })

    it('is claimed from the source runtime while it is read, and released once it is not', () => {
        const claims = assetClaims()
        assetMetadata$.mockReturnValue(of({bandNames: ['B1'], properties: {}}))
        const {watch} = sync({recipe: assetRecipe('users/bob/image'), claimAssets: claims.claim})
        watch.start()
        expect(claims.held()).toEqual([['users/bob/image']])

        watch.stop()

        expect(claims.held()).toEqual([])
    })

    // Claiming can dispatch, and what that dispatch causes can end or replace the observation the claim was made for.
    it('is released when the runtime closes while it is being claimed', () => {
        const claims = assetClaims()
        assetMetadata$.mockReturnValue(of({bandNames: ['B1'], properties: {}}))
        const harness = sync({
            recipe: assetRecipe('users/bob/image'),
            claimAssets: ids => claims.claim(ids, () => harness.registry.close())
        })

        harness.watch.start()

        expect(claims.made()).toEqual([['users/bob/image']])
        expect(claims.held()).toEqual([])
    })

    it('is released when the selection moves on while it is being claimed, and the new selection held', () => {
        const claims = assetClaims()
        assetMetadata$.mockReturnValue(of({bandNames: ['B1'], properties: {}}))
        const harness = sync({
            recipe: assetRecipe('users/bob/image'),
            claimAssets: ids => claims.claim(ids, () => claims.made().length === 1
                && harness.rerender({recipe: assetRecipe('users/bob/other')}))
        })

        harness.watch.start()

        expect(claims.held()).toEqual([['users/bob/other']])
    })

    it('is not observed again while its token is the same', () => {
        const version = {['users/bob/image']: {version: '2026-01-01T00:00:00.000001Z', checkedAt: 0}}
        const {watch, rerender} = observing(version)
        watch.start()

        rerender({assetEvidence: {...version}})

        expect(read$).toHaveBeenCalledTimes(1)
    })
})

const assetRecipe = assetId => maskingRecipe({primary: {type: 'ASSET', id: assetId}})

// Asset claims made through `claimAssets`, each running `whileClaiming` before it returns its release.
const assetClaims = () => {
    const claims = []
    return {
        claim: (ids, whileClaiming = () => {}) => {
            const claim = {ids, released: false}
            claims.push(claim)
            whileClaiming()
            return () => claim.released = true
        },
        made: () => claims.map(({ids}) => ids),
        held: () => claims.filter(({released}) => !released).map(({ids}) => ids)
    }
}
