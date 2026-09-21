import {act, useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {isObservable, of, ReplaySubject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// Retrieving through Masking the way a user does: the bands the panel's own output resolution describes are
// shown by the real band control, clicked, and applied through the real Retrieve panel, form and submission.
// Earth Engine, recipe reads, task submission and panel activation are the substitutes; the asset destination
// widget, which checks Earth Engine, is not rendered.

const submitted = vi.hoisted(() => [])
const geeReads = vi.hoisted(() => [])
// What Earth Engine answers for a band request, where the scenario needs one observed.
const observed = vi.hoisted(() => ({answer: null}))

vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: args => {
            geeReads.push(args)
            const answer = observed.answer?.(args)
            if (!answer) {
                return throwError(() => new Error('Earth Engine is not observed here'))
            }
            // A scenario that controls WHEN the answer arrives hands back its own observable.
            return isObservable(answer) ? answer : of(answer)
        },
        assetMetadata$: args => {
            geeReads.push(args)
            return of({bandNames: [], properties: {}})
        }
    },
    recipe: {load$: id => throwError(() => new Error(`Unexpected recipe load: ${id}`))},
    tasks: {
        submit$: task => {
            submitted.push(task)
            return of(task)
        }
    }
}}))
// The key stands for the message, with any values it names appended, so a message that has to identify
// something is asserted on what it identifies rather than on which key it used.
vi.mock('~/translate', () => ({
    msg: (key, values) => [
        Array.isArray(key) ? key.join('.') : key,
        ...Object.values(values || {})
    ].join(' ')
}))
vi.mock('~/user', () => ({isGoogleAccount: () => true}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
// The one destination widget that checks Earth Engine: it names the asset, picks a strategy and reports that
// its check has settled. Array bands can only go to Earth Engine, so a CCDC export needs it.
vi.mock('~/widget/assetDestination', () => ({
    AssetDestination: ({assetInput, strategyInput, onValidityCheckChange}) => {
        useEffect(() => {
            assetInput.set('users/x/segments')
            strategyInput.set('fail')
            onValidityCheckChange(false)
        }, [])
        return null
    }
}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
// The registry as production wires Masking's own entry.
vi.mock('~/app/home/body/process/recipeTypeRegistry', async () => {
    const {getAvailableBands} = await import('../../bands')
    const {getPreSetVisualizations} = await import('../../visualizations')
    return {
        getRecipeType: type => type === 'MASKING'
            ? {id: 'MASKING', getAvailableBands, getPreSetVisualizations}
            : {id: type, getPreSetVisualizations: () => []}
    }
})

const {ccdcMeasures, ccdcOutputBands} = await import('#sepal/recipe/type/ccdc')
const {SourceEvidenceSync} = await import('~/app/home/body/process/recipe/sourceEvidenceSync')
const {maskingObservation} = await import('../../maskingSourceEvidence')
const {Retrieve} = await import('./retrieve')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The panel's own minimum, matched here rather than imported: a change to it must be a deliberate change to
// these expectations too.
const MINIMUM_LOADING_MS = 500
const PAST_MINIMUM_MS = MINIMUM_LOADING_MS + 50

describe('retrieving a generated index from Masking over an optical mosaic', () => {
    it('shows the index in the band control, and submits it once clicked and applied', async () => {
        await open()

        await click('nbr')
        await click('process.retrieve.form.destination.DRIVE')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['nbr']})
        expect(geeReads).toEqual([])
    })
})

// The collection this Asset recipe filters is read as its first image, which holds red alone. What the recipe
// provides, and so what Retrieve offers, is what its own configured image holds.
describe('retrieving from Masking over an Asset recipe that filters its collection', () => {
    it('shows the band the filter leaves, and submits it once clicked and applied', async () => {
        observed.answer = ({asset}) => asset
            ? [{name: 'red', arrayDimensions: 0}]
            : [{name: 'red', arrayDimensions: 0}, {name: 'nir', arrayDimensions: 0}]

        await open({recipes: [MASKED_ASSET, ASSET_RECIPE], id: MASKED_ASSET.id})

        await click('nir')
        await click('process.retrieve.form.destination.DRIVE')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['nir']})
    })
})

// CCDC fits only the measures it is asked for, so the image it builds unrequested holds the breakpoint
// measures alone. What Retrieve may offer is the catalogue CCDC declares.
describe('retrieving a CCDC measure it does not break on, through Masking', () => {
    it('shows it in the band control, and submits the physical bands once clicked and applied', async () => {
        observed.answer = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))

        await open({recipes: [MASKED_CCDC, CCDC], id: MASKED_CCDC.id})

        await click('red_coefs')
        await click('tStart')
        await click('process.retrieve.form.destination.GEE')
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['red_coefs', 'tStart']})
    })
})

// What Retrieve offers is what the resolution in flight eventually describes - never the band names copied
// into the model when the source was selected, which nothing has verified since.
describe('a saved band snapshot that disagrees with the catalogue', () => {
    const STALE = 'stale_coefs'

    const staleSnapshot = (bands = ['tStart', STALE]) => ({
        ...MASKED_CCDC,
        model: {...MASKED_CCDC.model, imageToMask: {...MASKED_CCDC.model.imageToMask, bands}}
    })

    const catalogue = () => ccdcOutputBands(ccdcMeasures({model: CCDC.model}))

    it('offers none of its names while the resolution is still in flight', async () => {
        const answer = answering()

        await open({recipes: [staleSnapshot(), CCDC], id: MASKED_CCDC.id})

        expect(offers(STALE)).toBe(false)
        expect(offers('tStart')).toBe(false)

        await answer.arrive(catalogue())

        expect(offers('tStart')).toBe(true)
        expect(offers(STALE)).toBe(false)
    })

    it('submits nothing while the resolution is still in flight', async () => {
        answering()

        await open({recipes: [staleSnapshot(), CCDC], id: MASKED_CCDC.id})
        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    it('keeps the saved selection through loading and submits exactly it once resolved', async () => {
        const answer = answering()
        const saved = {
            ...staleSnapshot(['tStart']),
            ui: {retrieve: {destination: 'GEE', bands: ['tStart', 'red_coefs']}}
        }

        await open({recipes: [saved, CCDC], id: MASKED_CCDC.id})
        await answer.arrive(catalogue())
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart', 'red_coefs']})
    })

    it('names a saved band the catalogue does not hold and refuses to submit it', async () => {
        const answer = answering()
        const saved = {
            ...staleSnapshot(),
            ui: {retrieve: {destination: 'GEE', bands: ['tStart', STALE]}}
        }

        await open({recipes: [saved, CCDC], id: MASKED_CCDC.id})
        await answer.arrive(catalogue())

        expect(shown()).toContain(`process.retrieve.form.bands.unavailable ${STALE}`)

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    it('offers nothing and explains itself when the resolution fails', async () => {
        const answer = answering()

        await open({recipes: [staleSnapshot(), CCDC], id: MASKED_CCDC.id})
        await answer.fail()

        expect(offers(STALE)).toBe(false)
        expect(offers('tStart')).toBe(false)
        expect(shown()).toContain('process.retrieve.error.imageOutput')

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    // The user edits the recipe while an answer is outstanding. The replacement resolves from configuration
    // alone, and the answer to the question that was replaced can no longer describe anything.
    it('lets no superseded answer reach the replacement', async () => {
        const answer = answering()
        const masked = staleSnapshot()

        await open({recipes: [masked, CCDC, MOSAIC], id: masked.id})
        await editRecipe(masked.id, {
            model: {...masked.model, imageToMask: {type: 'RECIPE_REF', id: MOSAIC.id}}
        })
        await answer.arrive(catalogue())

        expect(offers('nbr')).toBe(true)
        expect(offers('red_coefs')).toBe(false)
        expect(offers(STALE)).toBe(false)
    })
})

// A selected band the catalogue does not hold is not the panel's to drop. It is what the warning names and
// what blocks retrieval, and it has to survive anything but the user editing the selection - otherwise a
// later resolution quietly submits a different export than the one the user saved.
describe('a selected band the catalogue does not hold', () => {
    const MISSING = 'red_coefs'

    const saved = bands => ({...MASKED_CCDC, ui: {retrieve: {destination: 'GEE', bands}}})

    const withoutRed = () => ccdcOutputBands(['ndvi'])
    const withRed = () => ccdcOutputBands(['ndvi', 'red'])

    const opened = async (bands = ['tStart', MISSING]) => {
        observed.answer = () => withoutRed()
        await open({recipes: [saved(bands), CCDC], id: MASKED_CCDC.id})
    }

    it('names it and refuses to submit', async () => {
        await opened()

        expect(shown()).toContain(`process.retrieve.form.bands.unavailable ${MISSING}`)

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    it('still names it and still refuses after the recipe is renamed', async () => {
        await opened()

        await editRecipe(MASKED_CCDC.id, {title: 'Renamed'})

        expect(shown()).toContain(`process.retrieve.form.bands.unavailable ${MISSING}`)

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    it('submits it once the catalogue holds it again, without the user selecting it', async () => {
        await opened()

        observed.answer = () => withRed()
        await editRecipe(MASKED_CCDC.id, {model: {...MASKED_CCDC.model, imageMask: {type: 'RECIPE_REF', id: CCDC.id, revised: true}}})
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart', MISSING]})
    })

    it('goes when the user edits the selection, which is what unblocks retrieval', async () => {
        await opened()

        await click('ndvi_coefs')

        expect(shown()).not.toContain('process.retrieve.form.bands.unavailable')

        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart', 'ndvi_coefs']})
    })
})

describe('what makes the panel resolve again', () => {
    const catalogue = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))

    const resolved = async () => {
        observed.answer = catalogue
        await open({recipes: [MASKED_CCDC, CCDC], id: MASKED_CCDC.id})
        expect(offers('red_coefs')).toBe(true)
        return geeReads.length
    }

    it('keeps its choices, and asks nothing more, through panel state and a rename', async () => {
        const reads = await resolved()

        await editUi(MASKED_CCDC.id, {panelExpanded: true})
        await editRecipe(MASKED_CCDC.id, {title: 'Renamed'})

        expect(offers('red_coefs')).toBe(true)
        expect(shown()).not.toContain('process.retrieve.form.bands.loading')
        expect(geeReads).toHaveLength(reads)
    })

    it('withholds them the moment the model changes, blocks retrieval and asks again', async () => {
        const reads = await resolved()
        const answer = answering()

        await editRecipe(MASKED_CCDC.id, {
            model: {...MASKED_CCDC.model, imageMask: {type: 'RECIPE_REF', id: CCDC.id, revised: true}}
        })

        expect(offers('red_coefs')).toBe(false)
        expect(geeReads.length).toBeGreaterThan(reads)
        // An open panel stays open: only the choices are withheld, never the form behind the opening view.
        expect(shown()).toContain('process.retrieve.form.scale')
        expect(shown()).not.toContain('process.retrieve.form.bands.loading')

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])

        await answer.arrive(ccdcOutputBands(ccdcMeasures({model: CCDC.model})))

        expect(offers('red_coefs')).toBe(true)
    })

    it('resolves afresh when the panel is opened again', async () => {
        const reads = await resolved()

        act(() => root.unmount())
        await open({recipes: [MASKED_CCDC, CCDC], id: MASKED_CCDC.id})

        expect(geeReads.length).toBeGreaterThan(reads)
        expect(offers('red_coefs')).toBe(true)
    })
})

// The producer behind the mask can change while the masking recipe itself is untouched. What reaches the panel
// then is the evidence its lifecycle publishes about that source - which is where its validity comes from, not
// merely how it is presented.
describe('a change to the producer behind the mask', () => {
    const THERMAL = 'thermal_coefs'

    const catalogue = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))

    // Thermal is carried by Landsat and not by Sentinel-2, so switching the producer's data sets is a band
    // the mask can no longer offer.
    const sourcedFrom = dataSets => ({
        model: {...CCDC.model, sources: {...CCDC.model.sources, dataSets}}
    })
    const SENTINEL_2 = sourcedFrom({SENTINEL_2: ['SENTINEL_2']})
    const LANDSAT_7 = sourcedFrom({LANDSAT: ['LANDSAT_7']})

    const openSelecting = async bands => {
        observed.answer = catalogue
        const saved = {...MASKED_CCDC, ui: {retrieve: {destination: 'GEE', bands}}}
        await open({recipes: [saved, CCDC], id: MASKED_CCDC.id})
        expect(offers(THERMAL)).toBe(true)
    }

    it('withdraws a band it no longer provides, names the saved selection and blocks submission', async () => {
        await openSelecting(['tStart', THERMAL])

        await editRecipe(CCDC.id, SENTINEL_2)

        expect(offers(THERMAL)).toBe(false)
        expect(shown()).toContain(`process.retrieve.form.bands.unavailable ${THERMAL}`)

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    it('withholds its choices and blocks submission when the source cannot be read again', async () => {
        await openSelecting(['tStart'])

        observed.answer = null
        await editRecipe(CCDC.id, SENTINEL_2)

        expect(offers('tStart')).toBe(false)
        expect(shown()).toContain('process.retrieve.error.imageOutput')

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])
    })

    it('offers what the producer provides once it can be read again', async () => {
        await openSelecting(['tStart'])
        observed.answer = null
        await editRecipe(CCDC.id, SENTINEL_2)
        expect(shown()).toContain('process.retrieve.error.imageOutput')

        observed.answer = catalogue
        await editRecipe(CCDC.id, LANDSAT_7)

        expect(offers(THERMAL)).toBe(true)

        await click(THERMAL)
        await click('process.retrieve.apply')

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image.bands).toEqual({selection: ['tStart', THERMAL]})
    })
})

// The panel opens on a loading view rather than on an empty form that fills in. It is held for a minimum so a
// near-instant answer cannot make it flicker past, and the minimum overlaps the read rather than following it.
describe('the view a panel opens with', () => {
    const LOADING = 'process.retrieve.form.bands.loading'
    const FORM = 'process.retrieve.form.scale'

    const mountMasked = () => mountPanel({recipes: [MASKED_CCDC, CCDC], id: MASKED_CCDC.id})

    it('holds the loading view for the minimum, then reveals the whole form', async () => {
        observed.answer = ({recipe}) => ccdcOutputBands(ccdcMeasures({model: recipe.model}))
        await mountMasked()

        expect(shown()).toContain(LOADING)
        expect(shown()).not.toContain(FORM)

        await advanceBy(MINIMUM_LOADING_MS - 50)

        expect(shown()).toContain(LOADING)

        await advanceBy(50)

        expect(shown()).not.toContain(LOADING)
        expect(shown()).toContain(FORM)
        expect(offers('red_coefs')).toBe(true)
    })

    it('waits for a read outstanding past the minimum, and blocks retrieval meanwhile', async () => {
        const answer = answering()
        await mountMasked()

        await advanceBy(PAST_MINIMUM_MS)

        expect(shown()).toContain(LOADING)
        expect(shown()).not.toContain(FORM)

        await click('process.retrieve.apply')

        expect(submitted).toEqual([])

        await answer.arrive(ccdcOutputBands(ccdcMeasures({model: CCDC.model})))

        expect(shown()).toContain(FORM)
        expect(offers('tStart')).toBe(true)
    })

    it('shows a failure without waiting for the minimum', async () => {
        const answer = answering()
        await mountMasked()

        await answer.fail()

        expect(shown()).toContain('process.retrieve.error.imageOutput')
        expect(shown()).toContain(FORM)
        expect(shown()).not.toContain(LOADING)
    })
})

const CCDC = {
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        dates: {startDate: '2000-01-01', endDate: '2020-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1}
    }
}

const MASKED_CCDC = {
    id: 'masked-ccdc-1',
    type: 'MASKING',
    title: 'Masked segments',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: CCDC.id},
        imageMask: {type: 'RECIPE_REF', id: CCDC.id}
    },
    ui: {}
}

const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    }
}

const MASKING = {
    id: 'masked-1',
    type: 'MASKING',
    title: 'Masked mosaic',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: MOSAIC.id},
        imageMask: {type: 'RECIPE_REF', id: MOSAIC.id}
    },
    ui: {}
}

const ASSET_RECIPE = {
    id: 'asset-1',
    type: 'ASSET_MOSAIC',
    model: {
        assetDetails: {assetId: 'users/x/collection', type: 'ImageCollection'},
        dates: {type: 'DATE_RANGE', fromDate: '2021-01-01', toDate: '2022-01-01'},
        composite: {type: 'MOSAIC'}
    }
}

const MASKED_ASSET = {
    id: 'masked-asset-1',
    type: 'MASKING',
    title: 'Masked asset',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: ASSET_RECIPE.id},
        imageMask: {type: 'RECIPE_REF', id: ASSET_RECIPE.id}
    },
    ui: {}
}

let root
let store

// The panel opens on a loading view held for a minimum, so a scenario about anything else waits that out
// before looking. A scenario about the view itself mounts and advances the clock itself.
const open = async (args = {}) => {
    await mountPanel(args)
    await advanceBy(PAST_MINIMUM_MS)
}

const mountPanel = ({recipes = [MASKING, MOSAIC], id = MASKING.id} = {}) => {
    const [, ...sources] = recipes
    store = createStore(
        (state = {
            dimensions: {width: 1024, height: 768},
            user: {currentUser: {googleTokens: {}}},
            process: {
                loadedRecipes: Object.fromEntries(recipes.map(recipe => [recipe.id, recipe])),
                recipes: sources.map(({id, type}) => ({id, name: id, type})),
                projects: [],
                tabs: []
            }
        }, action) => action.reduce ? action.reduce(state) : state
    )
    initStore(store)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    return act(async () => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <PortalContainer id='test-portal'/>
            <PortalContext id='test-portal'>
                <EventShield>
                    <SourceRuntimeProvider>
                        <Recipe id={id}>
                            <SourceEvidenceSync observation={maskingObservation}/>
                            <Retrieve/>
                        </Recipe>
                    </SourceRuntimeProvider>
                </EventShield>
            </PortalContext>
        </Provider>
    ))
}

const buttons = () => [...document.querySelectorAll('button')]

const click = label => act(async () => {
    const button = buttons().find(button => button.textContent === label)
    expect(button, `no button labelled ${label}`).toBeDefined()
    button.click()
})

const offers = label => buttons().some(button => button.textContent === label)

const shown = () => document.body.textContent

// The panel reads the recipe out of the store, so replacing the record is what a user editing the recipe
// does - and what changes the basis the panel resolves.
const editRecipe = (id, update) => act(async () => store.dispatch({
    type: 'EDIT_RECIPE',
    reduce: state => ({
        ...state,
        process: {
            ...state.process,
            loadedRecipes: {
                ...state.process.loadedRecipes,
                [id]: {...state.process.loadedRecipes[id], ...update}
            }
        }
    })
}))

// A transient view change, leaving everything the panel resolves - and the evidence the sync component holds -
// exactly as it was.
const editUi = (id, update) => editRecipe(id, {
    ui: {...store.getState().process.loadedRecipes[id].ui, ...update}
})

const advanceBy = ms => act(async () => vi.advanceTimersByTime(ms))

// One outstanding answer, replayed: every request for it waits, and the panel restarting its resolution -
// which the evidence lifecycle causes by publishing what it observed - asks the same question again.
const answering = () => {
    const pending = new ReplaySubject(1)
    observed.answer = () => pending
    return {
        arrive: bandNames => act(async () => {
            pending.next(bandNames)
            pending.complete()
        }),
        fail: () => act(async () => pending.error(new Error('Earth Engine is unreachable')))
    }
}

// Only the panel's own minimum-duration timer is suspended; faking more than the two calls it makes would put
// React's scheduling under test control too.
beforeEach(() => vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']}))

afterEach(() => {
    act(() => root?.unmount())
    vi.useRealTimers()
    document.body.innerHTML = ''
    submitted.length = 0
    geeReads.length = 0
    observed.answer = null
    store = null
})
