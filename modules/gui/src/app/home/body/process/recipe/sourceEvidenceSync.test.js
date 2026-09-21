import {of, Subject, throwError} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// Observing the source a recipe inherits its schema from: what is asked, when it is asked again, and what
// is done with the answer.
//
// `compose` is the identity here, so the export is the class and its lifecycle methods can be driven
// directly. `stream` is the real contract's shape - a name, an observable, a next and an error callback -
// reduced to a plain subscription, which is all this component uses it for. Props are replaced between
// lifecycle calls the way React replaces them on a rerender.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

const bands$ = vi.fn()
const assetMetadata$ = vi.fn()

vi.mock('~/apiRegistry', () => ({
    default: {gee: {bands$: (...args) => bands$(...args), assetMetadata$: (...args) => assetMetadata$(...args)}}
}))

vi.mock('../recipeTypeRegistry', () => ({
    getRecipeType: () => ({getPreSetVisualizations: recipe => recipe.model.presets || []})
}))

const styled = (recipe, own) => ({...recipe, layers: {userDefinedVisualizations: {'this-recipe': own}}})

const {SourceEvidenceSync} = await import('./sourceEvidenceSync')
const {maskingObservation} = await import('./masking/maskingSourceEvidence')

const CCDC_PRESETS = [{id: 'v-red', bands: ['red']}]

const recipeSelection = id => ({type: 'RECIPE_REF', id})

const maskingRecipe = ({primary, sourceEvidence} = {}) => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: primary},
    ...(sourceEvidence ? {ui: {sourceEvidence}} : {})
})

const ccdcRecipe = (id, presets = CCDC_PRESETS) => ({id, type: 'CCDC', model: {presets}})

const sync = ({
    recipe,
    loadedRecipes = {},
    catalogue = [],
    openRecipeIds = [],
    assetVersions = [],
    earthEngineGeneration = {},
    loadRecipe$ = id => of(ccdcRecipe(id)),
    reloadRecipe$ = id => of(ccdcRecipe(id))
}) => {
    const dispatched = []
    const recipeActionBuilder = () => ({
        set(path, value) {
            this.written = {path, value}
            return this
        },
        dispatch() {
            dispatched.push(this.written)
        }
    })
    const component = new SourceEvidenceSync({
        observation: maskingObservation,
        recipe,
        loadedRecipes,
        catalogue,
        openRecipeIds,
        assetVersions,
        earthEngineGeneration,
        recipeActionBuilder,
        loadRecipe$,
        reloadRecipe$,
        stream: (_name, stream$, onNext, onError) => stream$.subscribe({next: onNext, error: onError})
    })
    const rerender = props => {
        component.props = {...component.props, ...props}
        component.componentDidUpdate()
    }
    return {component, dispatched, rerender, evidence: () => dispatched.map(({value}) => value)}
}

beforeEach(() => {
    bands$.mockReset()
    assetMetadata$.mockReset()
})

describe('observing a recipe source', () => {
    it('asks what the loaded source recipe actually produces, and states its band facts', () => {
        const source = ccdcRecipe('source-1')
        bands$.mockReturnValue(of(['red', 'ndvi_coefs']))
        const {component, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadRecipe$: () => of(source)
        })

        component.componentDidMount()

        expect(bands$).toHaveBeenCalledWith({recipe: source})
        expect(evidence()).toEqual([expect.objectContaining({
            sourceKey: 'RECIPE_REF:source-1',
            status: 'OBSERVED',
            bands: [
                {name: 'red', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'},
                {name: 'ndvi_coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'}
            ],
            visualizations: CCDC_PRESETS
        })])
    })

    it('takes the presets from the source recipe, which Earth Engine knows nothing about', () => {
        bands$.mockReturnValue(of(['red']))
        const {component, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadRecipe$: () => of(ccdcRecipe('source-1'))
        })

        component.componentDidMount()

        expect(evidence()[0].visualizations).toEqual(CCDC_PRESETS)
    })
})

// The source is edited while the consumer is open. Nothing is copied, so the next look reports what the
// source says now - added, changed or gone.
describe('a style added, edited and deleted on the source', () => {
    const withOwn = own => styled(ccdcRecipe('source-1', []), own)
    const RATIO = {id: 'v-ratio', bands: ['ratio'], type: 'continuous', userDefined: true}

    const editing = () => {
        bands$.mockReturnValue(of(['ratio']))
        const {component, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {'source-1': withOwn([])},
            loadRecipe$: () => of(withOwn([]))
        })
        component.componentDidMount()
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
        bands$.mockReturnValue(of(['red']))
        const {component, evidence} = sync(nested())

        component.componentDidMount()

        expect(evidence()[0].visualizations).toEqual(CCDC_PRESETS)
    })

    it('takes bands from what the immediate source resolves to, observing only what its declarations observe', () => {
        bands$.mockReturnValue(of(['red']))
        const {component, evidence} = sync(nested())

        component.componentDidMount()

        expect(bands$).toHaveBeenCalledTimes(1)
        expect(bands$).toHaveBeenCalledWith({recipe: expect.objectContaining({id: 'source-1'})})
        expect(evidence()[0].bands).toEqual([{name: 'red', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'}])
    })

    it('still observes the immediate source\'s running image when what it wraps declares no output', () => {
        bands$.mockReturnValue(of([{name: 'VV', arrayDimensions: 0}]))
        const inner = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('radar-1')}}
        const records = {inner, 'radar-1': {id: 'radar-1', type: 'RADAR_MOSAIC', model: {}}}
        const {component, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadRecipe$: id => of(records[id])
        })

        component.componentDidMount()

        expect(bands$).toHaveBeenCalledTimes(1)
        expect(bands$).toHaveBeenCalledWith({recipe: inner, includeDataTypes: true})
        expect(evidence()[0].bands).toEqual([{name: 'VV', dataType: {arrayDimensions: 0}}])
    })

    // The shared graph is the authority on cycles, and a graph that cannot run has no evidence to give.
    // The wrapper in between can be styled too, and those styles describe its output - which, because it
    // preserves what it wraps, is also this recipe's. What it copied when its own source was selected is
    // the stale snapshot, and stays out.
    it('takes styles the wrapper owns, without reviving the presets it copied', () => {
        bands$.mockReturnValue(of(['red']))
        const inner = styled({
            id: 'inner',
            type: 'MASKING',
            model: {imageToMask: {...recipeSelection('source-1'), visualizations: [{id: 'stale', bands: ['gone']}]}}
        }, [{id: 'v-inner', bands: ['red'], type: 'continuous', userDefined: true}])
        const records = {inner, 'source-1': ccdcRecipe('source-1', CCDC_PRESETS)}
        const {component, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadRecipe$: id => of(records[id])
        })

        component.componentDidMount()

        expect(evidence()[0].visualizations).toEqual([
            {id: 'v-inner', bands: ['red'], type: 'continuous'},
            ...CCDC_PRESETS
        ])
    })

    it('reports a cyclic chain as unavailable rather than following it', () => {
        bands$.mockReturnValue(of(['red']))
        const looping = {id: 'looping', type: 'MASKING', model: {imageToMask: recipeSelection('looping')}}
        const {component, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('looping')}),
            loadRecipe$: () => of(looping)
        })

        component.componentDidMount()

        expect(evidence()[0].status).toBe('UNAVAILABLE')
        expect(bands$).not.toHaveBeenCalled()
    })
})

describe('observing an asset source', () => {
    it('reads its schema through /bands and its presentation through metadata', () => {
        bands$.mockReturnValue(of([{name: 'B1', arrayDimensions: 0}]))
        assetMetadata$.mockReturnValue(of({bandNames: ['B1'], properties: {}}))
        const {component, evidence} = sync({
            recipe: maskingRecipe({primary: {type: 'ASSET', id: 'users/bob/image'}})
        })

        component.componentDidMount()

        expect(bands$).toHaveBeenCalledWith({asset: 'users/bob/image', includeDataTypes: true})
        expect(assetMetadata$).toHaveBeenCalledWith({asset: 'users/bob/image'})
        expect(evidence()[0].bands).toEqual([{name: 'B1', dataType: {arrayDimensions: 0}}])
    })
})

// An answer describes a source as it was when it was asked about. What governs a second look is therefore
// everything that could change the answer, not the source's identity - which never changes when the source
// itself is edited.
describe('asking again', () => {
    const observing = extra => {
        bands$.mockReturnValue(of(['red']))
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
        const {component, rerender} = observing()
        component.componentDidMount()

        rerender({})
        rerender({})

        expect(bands$).toHaveBeenCalledTimes(1)
    })

    it('does not happen because this component\'s own load reached the catalogue', () => {
        bands$.mockReturnValue(of(['red']))
        const source = ccdcRecipe('source-1')
        const {component, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {},
            loadRecipe$: () => of(source)
        })
        component.componentDidMount()

        rerender({loadedRecipes: {'source-1': source}})

        expect(bands$).toHaveBeenCalledTimes(1)
    })

    it('happens when that record is then edited', () => {
        bands$.mockReturnValue(of(['red']))
        const source = ccdcRecipe('source-1')
        const {component, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {},
            loadRecipe$: () => of(source)
        })
        component.componentDidMount()
        rerender({loadedRecipes: {'source-1': source}})

        rerender({loadedRecipes: {'source-1': ccdcRecipe('source-1', [{id: 'v-nir', bands: ['nir']}])}})

        expect(bands$).toHaveBeenCalledTimes(2)
    })

    it('happens when the source recipe is edited in the session', () => {
        const {component, rerender} = observing()
        component.componentDidMount()

        rerender({loadedRecipes: {'source-1': ccdcRecipe('source-1', [{id: 'v-nir', bands: ['nir']}])}})

        expect(bands$).toHaveBeenCalledTimes(2)
    })

    it('happens when the panel applies refreshed data over the same source', () => {
        const {component, rerender} = observing()
        component.componentDidMount()

        rerender({
            recipe: maskingRecipe({primary: {...recipeSelection('source-1'), bands: ['red', 'nir']}})
        })

        expect(bands$).toHaveBeenCalledTimes(2)
    })

    it('happens when a recipe deeper in the chain is edited', () => {
        bands$.mockReturnValue(of(['red']))
        const inner = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('source-1')}}
        const records = {inner, 'source-1': ccdcRecipe('source-1')}
        const {component, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: records,
            loadRecipe$: id => of(records[id])
        })
        component.componentDidMount()
        rerender({})

        rerender({
            loadedRecipes: {...records, 'source-1': ccdcRecipe('source-1', [{id: 'v-nir', bands: ['nir']}])}
        })

        expect(bands$).toHaveBeenCalledTimes(2)
    })

    // A source edited in another session is never in this one's cache, so the catalogue revision is the only
    // thing that can say it changed.
    it('happens when the catalogue revision of a chain recipe advances', () => {
        const {component, rerender} = observing({catalogue: [{id: 'source-1', revision: 3}]})
        component.componentDidMount()
        rerender({})

        rerender({catalogue: [{id: 'source-1', revision: 4}]})

        expect(bands$).toHaveBeenCalledTimes(2)
    })

    it('does not happen when an unrelated recipe advances', () => {
        const {component, rerender} = observing({catalogue: [{id: 'source-1', revision: 3}]})
        component.componentDidMount()
        rerender({})

        rerender({catalogue: [{id: 'source-1', revision: 3}, {id: 'elsewhere', revision: 9}]})

        expect(bands$).toHaveBeenCalledTimes(1)
    })

    it('happens when the Earth Engine identity is replaced', () => {
        const {component, rerender} = observing()
        component.componentDidMount()

        rerender({earthEngineGeneration: {}})

        expect(bands$).toHaveBeenCalledTimes(2)
    })

    it('happens when the selection changes to another source', () => {
        const {component, rerender} = observing()
        component.componentDidMount()

        rerender({recipe: maskingRecipe({primary: recipeSelection('source-2')})})

        expect(bands$).toHaveBeenCalledTimes(2)
    })

    it('does not happen merely because an earlier attempt failed', () => {
        bands$.mockReturnValue(throwError(() => new Error('unreachable')))
        const source = ccdcRecipe('source-1')
        const {component, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {'source-1': source},
            loadRecipe$: () => of(source)
        })

        component.componentDidMount()
        rerender({})

        expect(bands$).toHaveBeenCalledTimes(1)
    })
})

// A source that cannot be reached is recorded as such. Leaving no evidence at all would let consumers keep
// presenting the bands a saved recipe remembers as though they were current.
describe('an observation that fails', () => {
    it('records the source as unavailable rather than leaving the recipe on its snapshot', () => {
        bands$.mockReturnValue(throwError(() => new Error('unreachable')))
        const {component, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadRecipe$: () => of(ccdcRecipe('source-1'))
        })

        component.componentDidMount()

        expect(evidence()).toEqual([expect.objectContaining({
            sourceKey: 'RECIPE_REF:source-1',
            status: 'UNAVAILABLE'
        })])
    })
})

describe('an answer for a source that is no longer selected', () => {
    it('is not written', () => {
        const answer = new Subject()
        bands$.mockReturnValue(answer)
        const {component, dispatched, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadRecipe$: () => of(ccdcRecipe('source-1'))
        })
        component.componentDidMount()

        rerender({recipe: maskingRecipe({primary: recipeSelection('source-2')})})
        answer.next(['stale'])

        expect(dispatched.filter(({value}) => value.sourceKey === 'RECIPE_REF:source-1')).toEqual([])
    })
})

describe('each answer published', () => {
    it('distinguishes a renewed read even when the source describes the same bands', () => {
        bands$.mockReturnValue(of(['red']))
        const source = ccdcRecipe('source-1')
        const {component, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {'source-1': source},
            loadRecipe$: () => of(source)
        })
        component.componentDidMount()

        rerender({loadedRecipes: {'source-1': {...source, revision: 2}}})

        expect(evidence()).toHaveLength(2)
        const [first, second] = evidence()
        expect(second.bands).toEqual(first.bands)
        expect(second).not.toEqual(first)
    })
})

describe('a recipe that needs no observation', () => {
    it('observes nothing when it inherits no schema', () => {
        const {component, dispatched} = sync({recipe: {id: 'ccdc-1', type: 'CCDC', model: {}}})

        component.componentDidMount()

        expect(bands$).not.toHaveBeenCalled()
        expect(assetMetadata$).not.toHaveBeenCalled()
        expect(dispatched).toEqual([])
    })

    it('observes nothing when no source is selected', () => {
        const {component} = sync({recipe: maskingRecipe()})

        component.componentDidMount()

        expect(bands$).not.toHaveBeenCalled()
    })
})

// A revision advancing is only evidence that the session's copy is behind. Observing again while still
// reading that copy answers with the same content it already had.
describe('a dependency the catalogue has moved past', () => {
    const behind = ccdcRecipe('source-1', [{id: 'v-old', bands: ['red']}])
    const ahead = ccdcRecipe('source-1', [{id: 'v-new', bands: ['nir']}])

    const observing = ({openRecipeIds = []} = {}) => {
        bands$.mockReturnValue(of(['red']))
        const reloadRecipe$ = vi.fn(() => of({...ahead, revision: 4}))
        return {
            reloadRecipe$,
            ...sync({
                recipe: maskingRecipe({primary: recipeSelection('source-1')}),
                loadedRecipes: {'source-1': {...behind, revision: 3}},
                catalogue: [{id: 'source-1', revision: 4}],
                openRecipeIds,
                loadRecipe$: () => of({...behind, revision: 3}),
                reloadRecipe$
            })
        }
    }

    it('is read again rather than answered from the copy the session holds', () => {
        const {component, reloadRecipe$} = observing()

        component.componentDidMount()

        expect(reloadRecipe$).toHaveBeenCalledWith('source-1')
    })

    it('publishes what the newer revision says, not what the stale copy said', () => {
        const {component, evidence} = observing()

        component.componentDidMount()

        expect(evidence()[0].visualizations).toEqual([{id: 'v-new', bands: ['nir']}])
    })

    // An open recipe's cached entry is a draft. Whatever is persisted must not replace unsaved work.
    it('is left alone when it is open for editing', () => {
        const {component, evidence, reloadRecipe$} = observing({openRecipeIds: ['source-1']})

        component.componentDidMount()

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
        bands$.mockReturnValueOnce(held).mockReturnValue(of(['unexpected-restart']))
        const {component, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: records
        })
        component.componentDidMount()

        rerender({loadedRecipes: {
            ...records,
            'source-1': {...records['source-1'], ui: {dates: {endDate: '2022-01-01', dirty: true}}}
        }})
        held.next(['red'])
        held.complete()

        expect(bands$).toHaveBeenCalledTimes(1)
        expect(evidence()).toEqual([expect.objectContaining({
            status: 'OBSERVED',
            bands: [{name: 'red', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'}],
            visualizations: records['source-1'].model.presets
        })])
    })

    // The first response is held open, the terminal source is edited, and only then does it arrive. Both
    // responses complete, so what is asserted is what actually reached the recipe.
    const raced = () => {
        const held = new Subject()
        bands$.mockReturnValueOnce(held).mockReturnValue(of(['red']))
        const {component, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: records,
            loadRecipe$: id => of(records[id])
        })
        component.componentDidMount()

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
        bands$.mockReturnValue(of(['red']))
        const mask = new Subject()
        const {component, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection(inner.id)}),
            loadedRecipes: atStart,
            loadRecipe$: () => mask
        })
        component.componentDidMount()

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
        bands$.mockReturnValue(of(['red']))
        const mask = new Subject()
        const {component, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection(inner.id)}),
            loadedRecipes: atStart,
            loadRecipe$: id => (id === 'mask-1' ? mask : of(atStart[id]))
        })
        component.componentDidMount()

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
        bands$.mockReturnValue(of(['red']))
        const reloadRecipe$ = vi.fn(() => of(ccdcRecipe('source-1')))
        const {component, rerender} = sync({
            recipe: maskingRecipe({primary: recipeSelection('source-1')}),
            loadedRecipes: {'source-1': {...ccdcRecipe('source-1'), revision: 5}},
            catalogue: [{id: 'source-1', revision: 4}],
            reloadRecipe$
        })

        component.componentDidMount()
        rerender({})
        rerender({})

        expect(reloadRecipe$).not.toHaveBeenCalled()
        expect(bands$).toHaveBeenCalledTimes(1)
    })
})

// A broken graph was still read from records, and repairing one of them is what makes it answerable.
describe('a cycle deeper in the chain', () => {
    const cyclic = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('inner')}}
    const repaired = {id: 'inner', type: 'MASKING', model: {imageToMask: recipeSelection('source-1')}}

    it('is observed again once the deeper recipe is repaired', () => {
        bands$.mockReturnValue(of(['red']))
        const {component, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: {inner: cyclic},
            loadRecipe$: id => of(id === 'inner' ? cyclic : ccdcRecipe(id))
        })
        component.componentDidMount()
        expect(evidence()[0].status).toBe('UNAVAILABLE')

        rerender({
            loadedRecipes: {inner: repaired, 'source-1': ccdcRecipe('source-1')},
            loadRecipe$: id => of(id === 'inner' ? repaired : ccdcRecipe(id))
        })

        expect(evidence()[1].status).toBe('OBSERVED')
    })
})

describe('a selected source with a missing mask', () => {
    const withMask = mask => ({
        id: 'inner',
        type: 'MASKING',
        model: {imageToMask: recipeSelection('source-1'), imageMask: mask}
    })

    it('is observed again after a missing one made the source unavailable', () => {
        bands$.mockReturnValue(of(['red']))
        const {component, rerender, evidence} = sync({
            recipe: maskingRecipe({primary: recipeSelection('inner')}),
            loadedRecipes: {inner: withMask(recipeSelection('gone'))},
            loadRecipe$: id => (id === 'gone'
                ? throwError(() => new Error('no such recipe'))
                : of(ccdcRecipe(id)))
        })
        component.componentDidMount()
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
        bands$.mockReturnValue(of(['red']))
        const {component, evidence} = sync({
            recipe: {
                ...maskingRecipe({primary: recipeSelection('source-1')}),
                model: {imageToMask: recipeSelection('source-1'), imageMask: recipeSelection('gone')}
            },
            loadRecipe$: id => id === 'gone'
                ? throwError(() => new Error('no such recipe'))
                : of(ccdcRecipe(id))
        })

        component.componentDidMount()

        expect(evidence()).toEqual([expect.objectContaining({
            status: 'OBSERVED',
            visualizations: CCDC_PRESETS
        })])
    })
})

// Earth Engine has no revision. The asset listing's update time is what says an asset has changed.
describe('an asset source', () => {
    const observing = assetVersions => {
        bands$.mockReturnValue(of([{name: 'B1', arrayDimensions: 0}]))
        assetMetadata$.mockReturnValue(of({bandNames: ['B1'], properties: {}}))
        return sync({
            recipe: maskingRecipe({primary: {type: 'ASSET', id: 'users/bob/image'}}),
            assetVersions
        })
    }

    it('is observed again when its listed update time advances', () => {
        const {component, rerender} = observing([{id: 'users/bob/image', updateTime: '2026-01-01T00:00:00.000001Z'}])
        component.componentDidMount()
        rerender({})

        rerender({assetVersions: [{id: 'users/bob/image', updateTime: '2026-01-01T00:00:00.000002Z'}]})

        expect(bands$).toHaveBeenCalledTimes(2)
    })

    it('is not observed again when it has not been touched', () => {
        const version = [{id: 'users/bob/image', updateTime: '2026-01-01T00:00:00.000001Z'}]
        const {component, rerender} = observing(version)
        component.componentDidMount()

        rerender({assetVersions: [...version]})

        expect(bands$).toHaveBeenCalledTimes(1)
    })
})
