import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// Selecting another classification proposes the settings it was trained with. Until the read for THAT
// selection has arrived, the recipe must keep the configuration it has, and when it is applied, the
// classification and the settings derived from it become the recipe in one step.
//
// The panel, its form and the real Apply path are rendered over a real store, and what is asserted is what
// the store publishes. Acquisition and panel activation are the substitutes.

const assetMetadata$ = vi.fn()
const loadRecipe$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {
    gee: {assetMetadata$: (...args) => assetMetadata$(...args)},
    recipe: {load$: (...args) => loadRecipe$(...args)}
}}))
vi.mock('~/translate', () => ({msg: (key, args) => [key, ...(args ? Object.values(args) : [])].join(' ')}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// What a field has to say is shown in its label's tooltip, which the real one renders into a portal on
// hover. Here it renders beside its trigger, and only when there is something to say, so the panel's own
// messages are observable without driving hover timers.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => msg ? <><span data-message>{msg}</span>{children}</> : children
}))
// The registry as production wires it: the window a mosaic covers is the mosaic's own answer.
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: type => ({
        MOSAIC: {id: 'MOSAIC', getDateRange: ({model: {dates}}) => [dates.seasonStart, dates.seasonEnd]},
        CLASSIFICATION: {id: 'CLASSIFICATION'},
        PYEO_ALERTS: {id: 'PYEO_ALERTS'}
    })[type]
}))
// The panel is open; how it gets opened is not what this exercises.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))

const {Sources} = await import('./sources')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const RECIPE = 'pyeo-1'
const SAVED = 'classification-saved'
const OTHER = 'classification-other'
const THIRD = 'classification-third'

const SAVED_OPTIONS = {corrections: ['SR'], compose: 'MEDOID'}
const SAVED_DATES = {
    baselineStart: '2018-01-01',
    baselineEnd: '2019-01-01',
    monitoringStart: '2019-01-01',
    monitoringEnd: '2020-01-01',
    derived: true
}

describe('applying while the selected classification is still being read', () => {
    it('commits nothing, not even the selection', async () => {
        const held = new Subject()
        await open({classificationRead: () => held})
        await select(OTHER)

        await apply()

        expect(sources().classification).toBe(SAVED)
        expect(options()).toEqual(SAVED_OPTIONS)
        expect(dates()).toEqual(SAVED_DATES)
    })

    // The classification arrives, its imagery has not. There is no moment in between where the proposal
    // looks complete - and once the imagery lands, the same Apply commits.
    it('commits nothing once its record has arrived but its imagery has not', async () => {
        const held = new Subject()
        await open({imageryRead: () => held})
        await select(OTHER)

        await apply()
        expect(sources().classification).toBe(SAVED)
        expect(options()).toEqual(SAVED_OPTIONS)

        await act(async () => {
            held.next(mosaicRecipe(mosaicOf(OTHER)))
            held.complete()
        })
        await chooseChangeClasses()
        await apply()

        expect(sources().classification).toBe(OTHER)
        expect(options()).toEqual(derivedOptions(OTHER))
    })

    // Submitting from the keyboard goes through the same decision as the Apply button.
    it('commits nothing when the form is submitted from the keyboard', async () => {
        const held = new Subject()
        await open({classificationRead: () => held})
        await select(OTHER)

        await submitForm()

        expect(sources().classification).toBe(SAVED)
        expect(options()).toEqual(SAVED_OPTIONS)
    })

    it('says the classification is being read', async () => {
        const held = new Subject()
        await open({classificationRead: () => held})

        await select(OTHER)

        expect(shownMessages()).toContain('process.pyeoAlerts.classification.pending')
    })
})

describe('applying a classification that has been read', () => {
    it('commits the selection together with the settings derived from it', async () => {
        await open({})
        await select(OTHER)
        await chooseChangeClasses()

        await apply()

        expect(sources().classification).toBe(OTHER)
        expect(sources().cloudPercentageThreshold).toBe(40)
        expect(options()).toEqual(derivedOptions(OTHER))
        expect(dates()).toEqual(derivedDates(OTHER))
    })

    // The classification and the settings derived from it are one configuration. Whatever reads the recipe
    // as the selection is published must never find it beside the settings it was applied to replace.
    it('never publishes the selection beside the settings it replaces', async () => {
        await open({})
        await select(OTHER)
        await chooseChangeClasses()

        await apply()

        expect(publishedWith(OTHER)).not.toHaveLength(0)
        publishedWith(OTHER).forEach(model => {
            expect(model.options).toEqual(derivedOptions(OTHER))
            expect(model.dates).toEqual(derivedDates(OTHER))
        })
    })

    it('leaves datasets the user chose alone', async () => {
        await open({})
        await select(OTHER)
        await chooseChangeClasses()

        await apply()

        expect(sources().dataSets).toEqual({LANDSAT: ['LANDSAT_8']})
    })
})

describe('returning to an earlier selection while another is being read', () => {
    // What was read for the earlier selection is gone the moment another is chosen. Coming back to it before
    // the panel has been told cannot let its identity alone authorize a commit.
    it('commits nothing until it has been read again', async () => {
        await open(oneSelectionHeld(THIRD))
        await select(OTHER)
        await chooseChangeClasses()
        await select(THIRD)

        selectWithoutSettling(OTHER)
        submitFormNow()
        await settle()

        expect(sources().classification).toBe(SAVED)
        expect(options()).toEqual(SAVED_OPTIONS)
        expect(dates()).toEqual(SAVED_DATES)
    })

    // The same submission, with nothing else about the form changed, commits once the read has arrived: what
    // refused it was the missing acquisition and not some other field.
    it('commits it with its own settings once it has been', async () => {
        await open(oneSelectionHeld(THIRD))
        await select(OTHER)
        await chooseChangeClasses()
        await select(THIRD)

        selectWithoutSettling(OTHER)
        submitFormNow()
        await settle()
        await chooseChangeClasses()
        await submitForm()

        expect(sources().classification).toBe(OTHER)
        expect(options()).toEqual(derivedOptions(OTHER))
        expect(dates()).toEqual(derivedDates(OTHER))
    })
})

// The answer is about a selection that is no longer the one on screen, so it authorizes nothing.
it('cannot apply a selection with a response that arrived for the one it replaced', async () => {
    const held = {}
    await open({classificationRead: id => held[id] = held[id] || new Subject()})
    await select(OTHER)
    await select(THIRD)

    await act(async () => {
        held[OTHER].next(classificationRecipe(OTHER))
        held[OTHER].complete()
    })
    await apply()

    expect(sources().classification).toBe(SAVED)
    expect(options()).toEqual(SAVED_OPTIONS)
    expect(dates()).toEqual(SAVED_DATES)
})

describe('a classification that could not be read', () => {
    // Choosing the same one again is how a user retries, so a failed attempt cannot be remembered as done.
    it('says so, commits nothing, and is applied once choosing it again succeeds', async () => {
        let attempts = 0
        await open({classificationRead: id => id === OTHER && attempts++ === 0
            ? throwError(() => new Error('unreachable'))
            : of(classificationRecipe(id))})
        await select(OTHER)

        await apply()
        expect(sources().classification).toBe(SAVED)
        expect(options()).toEqual(SAVED_OPTIONS)
        expect(shownMessages()).toContain('process.pyeoAlerts.classification.unavailable')

        await select(OTHER)
        await chooseChangeClasses()
        await apply()

        expect(sources().classification).toBe(OTHER)
        expect(options()).toEqual(derivedOptions(OTHER))
    })
})

// A successful read that states no configuration to copy: the user sets the dates by hand, and that is an
// applicable selection, not a failure.
it('applies a classification whose imagery states no configuration to copy', async () => {
    assetMetadata$.mockReturnValue(of({bandNames: ['B1'], properties: {}}))
    await open({imagery: {type: 'ASSET', id: 'users/x/mosaic'}})
    await select(OTHER)
    await chooseChangeClasses()

    await apply()

    expect(sources().classification).toBe(OTHER)
    expect(dates()).toEqual({...SAVED_DATES, derived: false})
    expect(options()).toEqual(SAVED_OPTIONS)
    expect(shownMessages()).toContain('process.pyeoAlerts.classification.notDerivable')
})

describe('cancelling a previewed classification', () => {
    it('commits nothing and goes back to showing the committed one', async () => {
        await open({})
        await select(OTHER)
        expect(shownLegend()).toBe(OTHER)

        await cancel()

        expect(shownLegend()).toBe(SAVED)
        expect(sources().classification).toBe(SAVED)
        expect(options()).toEqual(SAVED_OPTIONS)
        expect(dates()).toEqual(SAVED_DATES)
    })

    it('leaves a response that arrives afterwards unpublished', async () => {
        await open(oneSelectionHeld(OTHER))
        await select(OTHER)
        await cancel()

        await act(async () => {
            held.next(classificationRecipe(OTHER))
            held.complete()
        })

        expect(shownLegend()).toBe(SAVED)
        expect(sources().classification).toBe(SAVED)
    })
})

// Nothing is derived from a classification the user did not just choose, which only an Apply can show: a
// proposal staged at opening would be committed by the next unrelated edit.
it('applies an unrelated edit to a saved recipe without re-deriving its settings', async () => {
    await open({})

    await chooseChangeFromClass(SAVED)
    await apply()

    expect(sources().changeFromClasses).toEqual([1, 3])
    expect(sources().classification).toBe(SAVED)
    expect(options()).toEqual(SAVED_OPTIONS)
    expect(dates()).toEqual(SAVED_DATES)
})

const loadedRecipe = () => store.getState().process.loadedRecipes[RECIPE]

const recipeModel = () => loadedRecipe().model

const sources = () => recipeModel().sources

const options = () => recipeModel().options

const dates = () => recipeModel().dates

// Every model the store published while it named this classification.
const publishedWith = classification =>
    published.filter(model => model.sources && model.sources.classification === classification)

// The legend on screen names the classification it was read from.
const shownLegend = () =>
    (loadedRecipe().ui.classificationLegend?.entries || []).find(({value}) => value === 3)?.label

const shownMessages = () => [...document.querySelectorAll('[data-message]')].map(element => element.textContent)

const apply = () => clickButton('button.apply', 'the panel offers no Apply button')

const cancel = () => clickButton('button.cancel', 'the panel offers no Cancel button')

const clickButton = (label, missing) => act(async () => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent === label)
    expect(button, missing).toBeDefined()
    button.click()
})

const submit = () => {
    const form = document.querySelector('form')
    expect(form, 'the panel has no form to submit').toBeDefined()
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable: true}))
}

const submitForm = () => act(async () => submit())

// Submitted without letting the combo's deferred callback run: the instant where the field carries the new
// value and the panel has not been told about it.
const submitFormNow = () => act(() => submit())

const settle = () => act(async () => {})

const buttonsLabelled = label =>
    [...document.querySelectorAll('button')].filter(button => button.textContent === label)

// Choosing a classification clears the change classes, which the form requires. Filling them back in is
// what leaves the acquisition as the only thing an Apply can be waiting for.
const chooseChangeClasses = async () => {
    const from = buttonsLabelled('Forest')[0]
    const to = buttonsLabelled('Non-forest')[1]
    expect(from, 'no change-from classes to choose').toBeDefined()
    expect(to, 'no change-to classes to choose').toBeDefined()
    await act(async () => from.click())
    await act(async () => to.click())
}

const chooseChangeFromClass = async label => {
    const button = buttonsLabelled(label)[0]
    expect(button, `no change-from class ${label} to choose`).toBeDefined()
    await act(async () => button.click())
}

const select = async id => {
    await act(async () => document.querySelector('input').click())
    await act(async () => optionFor(id).click())
}

const selectWithoutSettling = id => {
    act(() => document.querySelector('input').click())
    act(() => optionFor(id).click())
}

const optionFor = id => {
    const option = [...document.querySelectorAll('li')]
        .map(item => item.firstElementChild)
        .find(item => item?.textContent === id)
    expect(option, `no option for ${id}`).toBeDefined()
    return option
}

// Each classification was trained on a mosaic of its own, so what a proposal contains says which
// classification it was read from.
const BASELINE_YEAR = {[SAVED]: 2013, [OTHER]: 2020, [THIRD]: 2017}

const mosaicOf = classificationId => `mosaic-of-${classificationId}`

const isMosaic = id => id.startsWith('mosaic-of-')

const derivedOptions = classificationId => ({corrections: ['SR', 'BRDF'], compose: classificationId})

const derivedDates = classificationId => {
    const year = BASELINE_YEAR[classificationId]
    return {
        baselineStart: `${year}-01-01`,
        baselineEnd: `${year + 1}-01-01`,
        monitoringStart: `${year + 1}-01-01`,
        monitoringEnd: `${year + 2}-01-01`,
        derived: true
    }
}

const classificationRecipe = id => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        legend: {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Non-forest'}, {value: 3, label: id}]},
        inputImagery: {images: [imagery || {type: 'RECIPE_REF', id: mosaicOf(id)}]}
    }
})

const mosaicRecipe = mosaicId => {
    const classificationId = mosaicId.replace('mosaic-of-', '')
    const year = BASELINE_YEAR[classificationId]
    return {
        id: mosaicId,
        type: 'MOSAIC',
        model: {
            sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, cloudPercentageThreshold: 40},
            compositeOptions: derivedOptions(classificationId),
            dates: {seasonStart: `${year}-01-01`, seasonEnd: `${year + 1}-01-01`, yearsBefore: 0, yearsAfter: 0}
        }
    }
}

let root, container, store, imagery, published, held

// One classification's record withheld until the test delivers it.
const oneSelectionHeld = classificationId => {
    held = new Subject()
    return {classificationRead: id => id === classificationId ? held : of(classificationRecipe(id))}
}

beforeEach(() => {
    imagery = null
    published = []
    held = null
    assetMetadata$.mockReset()
    loadRecipe$.mockReset()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

const open = ({classificationRead, imageryRead, imagery: input}) => {
    if (input) {
        imagery = input
    }
    loadRecipe$.mockImplementation(id => {
        if (isMosaic(id)) {
            return imageryRead ? imageryRead(id) : of(mosaicRecipe(id))
        }
        return classificationRead ? classificationRead(id) : of(classificationRecipe(id))
    })
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {
                [RECIPE]: {
                    id: RECIPE,
                    type: 'PYEO_ALERTS',
                    model: {
                        sources: {
                            classification: SAVED,
                            dataSets: {LANDSAT: ['LANDSAT_8']},
                            cloudPercentageThreshold: 75,
                            changeFromClasses: [1],
                            changeToClasses: [2]
                        },
                        options: SAVED_OPTIONS,
                        dates: SAVED_DATES
                    },
                    ui: {}
                }
            },
            recipes: [
                {id: SAVED, name: SAVED, type: 'CLASSIFICATION'},
                {id: OTHER, name: OTHER, type: 'CLASSIFICATION'},
                {id: THIRD, name: THIRD, type: 'CLASSIFICATION'}
            ],
            projects: [],
            tabs: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    // Teardown removes cached recipes, which publishes states this recipe is no longer in.
    store.subscribe(() => loadedRecipe() && published.push(recipeModel()))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    return act(async () => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <PortalContainer id='test-portal'/>
            <PortalContext id='test-portal'>
                <EventShield>
                    <Recipe id={RECIPE}>
                        <Sources/>
                    </Recipe>
                </EventShield>
            </PortalContext>
        </Provider>
    ))
}
