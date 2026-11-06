import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Observable, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {IMAGE_OUTPUT, PIXEL_OBSERVATIONS, PIXEL_SEGMENTS} from '#sepal/recipe/output/readiness'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// TMask screens a pixel's observations with two of the bands CCDC segments, so an enabled one must use breakpoint bands
// (type/ccdc.js). A Sources Apply may remove one it uses: OPT is then marked, and what segments the image is held,
// until either section repairs it. The CCDC root, its toolbar and panels, the store and the source runtime are real;
// recipe reads answer from stored records, Earth Engine with CCDC's segment bands, and no request ever completes for a
// chart.

const fake = vi.hoisted(() => ({stored: {}, open: new Set()}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => of(['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        loadCCDCSegments$: () => new Observable(),
        loadTimeSeriesObservations$: () => new Observable()
    },
    recipe: {load$: id => of(fake.stored[id]), loadAll$: () => of(LISTING), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => {
    const text = [key].flat().join('.')
    return values ? `${text} ${JSON.stringify(values)}` : text
}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().map(tooltipText).some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().map(tooltipText).filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
// The panels the test opens are open; no toolbar button is pressed.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: ({id}) => Component => props => fake.open.has(id)
        ? <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
        : null
}))
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props => <Component {...props} activator={{
        activatables: {button: {active: false, canActivate: true, toggle: () => {}}},
        updateActivatables: () => {}
    }}/>
}))
// The root's map and its layers: the toolbar is what is looked at.
vi.mock('~/app/home/map/map', async importOriginal => ({...await importOriginal(), Map: ({children}) => children}))
vi.mock('../aoi', async importOriginal => ({...await importOriginal(), Aoi: () => null}))
vi.mock('../recipeImageLayerSource', async importOriginal => ({...await importOriginal(), initializeLayers: () => {}}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc')
const {breakDetectionOptions} = await import('./ccdcRecipe')
const {mapProductGate, pixelOperationsAvailability, retrieveAvailability} = await import('../operationAvailability')
const {requestGate} = await import('../sourceRequirements')

addRecipeType(ccdc())
const Root = ccdc().components.recipe

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

beforeEach(() => {
    fake.open = new Set()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a TMask band removed from the breakpoint bands in Sources', () => {
    it('is removed, marking OPT and holding what segments the image, while the count and the observations stay available', async () => {
        await open({breakpointBands: ['green', 'swir1', 'ndvi'], tmaskBands: ['green', 'swir1'], panels: ['sources']})
        expect(inError(OPT)).toBe(false)

        await toggle(BREAKPOINT_BANDS, 'swir1')
        await press('button.apply')

        expect(model().sources.breakpointBands).toEqual(['green', 'ndvi'])
        expect(inError(OPT)).toBe(true)
        expect(buttonTooltip(OPT)).toContain(missing(['swir1']))
        for (const gate of [retrieveGate(), operationGate(IMAGE_OUTPUT), operationGate(PIXEL_SEGMENTS)]) {
            expect(gate).toMatchObject({withdraw: true, section: OPT})
        }
        expect(operationGate(PIXEL_OBSERVATIONS)).toBe(null)
        expect(countGate()).toBe(null)
    })

    it('stays chosen in OPT, which opens unchanged and says what is missing and how to repair it', async () => {
        await open({breakpointBands: ['green', 'ndvi'], tmaskBands: ['green', 'swir1'], panels: ['ccdcOptions']})

        expect(choicesOf(TMASK_BANDS)).toEqual(['green', 'ndvi', 'swir1'])
        expect(chosenOf(TMASK_BANDS)).toEqual(['green', 'swir1'])
        expect(errorsOf(TMASK_BANDS)).toEqual([missing(['swir1'])])
        expect(button('button.close').disabled).toBe(false)
    })

    it('refuses OPT\'s Apply and Enter for a draft keeping it, whatever else the draft changes', async () => {
        await open({breakpointBands: ['green', 'ndvi'], tmaskBands: ['green', 'swir1'], panels: ['ccdcOptions']})
        const applied = model()

        await toggle(DATE_FORMAT, 'process.ccdc.panel.dates.form.dateFormat.jDays.label')

        expect(errorsOf(TMASK_BANDS)).toEqual([missing(['swir1'])])
        expect(button('button.apply').disabled).toBe(true)
        await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
        await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})))
        await settled()

        expect(model()).toBe(applied)
        expect(chosenOf(TMASK_BANDS)).toEqual(['green', 'swir1'])
    })

    it('stays chosen, the model unchanged, as OPT renders again over a session read completing', async () => {
        await open({breakpointBands: ['green', 'ndvi'], tmaskBands: ['green', 'swir1'], panels: ['ccdcOptions']})
        const applied = model()

        await act(async () => store.dispatch({type: 'LISTING_CHECKED', reduce: state => ({
            ...state, process: {...state.process, recipeListing: {checkedAt: Date.now() + 1}}
        })}))
        await settled()

        expect(chosenOf(TMASK_BANDS)).toEqual(['green', 'swir1'])
        expect(model()).toBe(applied)
    })

    it('can be removed from TMask in OPT, which then offers the breakpoint bands alone', async () => {
        await open({breakpointBands: ['green', 'ndvi'], tmaskBands: ['green', 'swir1'], panels: ['ccdcOptions']})

        await toggle(TMASK_BANDS, 'swir1')

        expect(choicesOf(TMASK_BANDS)).toEqual(['green', 'ndvi'])
        expect(chosenOf(TMASK_BANDS)).toEqual(['green'])
    })
})

describe('a TMask using a band that is not a breakpoint band', () => {
    it.each([
        ['choosing two breakpoint bands in OPT', async () => {
            await toggle(TMASK_BANDS, 'swir1')
            await toggle(TMASK_BANDS, 'ndvi')
            await press('button.apply')
            return ['green', 'ndvi']
        }],
        ['clearing TMask in OPT', async () => {
            await toggle(TMASK_BANDS, 'green')
            await toggle(TMASK_BANDS, 'swir1')
            await press('button.apply')
            return []
        }],
        ['choosing a preset in OPT', async () => {
            await press('button.less')
            await toggle(BREAK_DETECTION, 'process.ccdc.panel.options.form.breakDetection.moderate.label')
            await press('button.apply')
            return undefined
        }]
    ])('is repaired by %s, clearing OPT\'s mark and what was held', async (_case, repair) => {
        await open({breakpointBands: ['green', 'ndvi'], tmaskBands: ['green', 'swir1'], panels: ['ccdcOptions']})
        expect(inError(OPT)).toBe(true)

        const tmaskBands = await repair()

        expect(model().ccdcOptions.tmaskBands).toEqual(tmaskBands)
        expect(inError(OPT)).toBe(false)
        expect(retrieveGate()).toBe(null)
        expect(operationGate(PIXEL_SEGMENTS)).toBe(null)
    })

    it('is repaired by restoring the band as a breakpoint band in Sources', async () => {
        await open({breakpointBands: ['green', 'ndvi'], tmaskBands: ['green', 'swir1'], panels: ['sources']})
        expect(inError(OPT)).toBe(true)

        await toggle(BREAKPOINT_BANDS, 'swir1')
        await press('button.apply')

        expect(model().sources.breakpointBands).toEqual(['green', 'ndvi', 'swir1'])
        expect(model().ccdcOptions.tmaskBands).toEqual(['green', 'swir1'])
        expect(inError(OPT)).toBe(false)
        expect(retrieveGate()).toBe(null)
    })
})

describe('a CCDC whose TMask uses no band that is not a breakpoint band', () => {
    it.each([
        ['a preset', undefined],
        ['advanced settings without TMask', [], {lambda: 25}],
        ['two breakpoint bands', ['green', 'ndvi']]
    ])('with %s marks nothing and holds nothing, OPT offering its breakpoint bands', async (_case, tmaskBands, options) => {
        await open({breakpointBands: ['green', 'swir1', 'ndvi'], tmaskBands, options, panels: ['ccdcOptions']})

        expect(inError(OPT)).toBe(false)
        expect(retrieveGate()).toBe(null)
        expect(operationGate(PIXEL_SEGMENTS)).toBe(null)
        if (tmaskBands) {
            expect(choicesOf(TMASK_BANDS)).toEqual(['green', 'swir1', 'ndvi'])
            expect(chosenOf(TMASK_BANDS)).toEqual(tmaskBands)
            expect(errorsOf(TMASK_BANDS)).toEqual([])
        }
    })
})

describe('OPT\'s TMask bands', () => {
    it('can be chosen while there is a breakpoint band to choose, however few', async () => {
        await open({breakpointBands: ['ndvi'], tmaskBands: [], options: {lambda: 25}, panels: ['ccdcOptions']})

        expect(choicesOf(TMASK_BANDS)).toEqual(['ndvi'])
        expect(choiceButtons(TMASK_BANDS).every(({disabled}) => !disabled)).toBe(true)
    })
})

const CCDC = 'ccdc-1'
const OPT = 'process.ccdc.panel.options.button'
const BREAKPOINT_BANDS = 'process.ccdc.panel.sources.form.breakpointBands.label'
const TMASK_BANDS = 'process.ccdc.panel.options.form.tmaskBands.label'
const BREAK_DETECTION = 'process.ccdc.panel.options.form.breakDetection.label'
const DATE_FORMAT = 'process.ccdc.panel.dates.form.dateFormat.label'
const LISTING = [{id: CCDC, name: 'CCDC', type: 'CCDC', revision: 1}]

const missing = bands => `process.ccdc.panel.options.form.tmaskBands.notBreakpointBands ${JSON.stringify({bands: bands.join(', '), count: bands.length})}`

// Over Landsat 8 surface reflectance, selecting no Classification, its options a preset's but for the TMask bands and
// `options` given.
const ccdcRecipe = ({breakpointBands, tmaskBands, options}) => ({
    id: CCDC,
    type: 'CCDC',
    title: 'CCDC',
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSetType: 'OPTICAL', classification: null, dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], cloudPercentageThreshold: 75, breakpointBands},
        options: {corrections: ['SR']},
        opticalPreprocess: {corrections: ['SR']},
        ccdcOptions: {...breakDetectionOptions.moderate, ...options, ...(tmaskBands && {tmaskBands})}
    },
    ui: {initialized: true}
})

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', CCDC, 'model'])

const applied = () => selectFrom(store.getState(), ['process.loadedRecipes', CCDC])

const retrieveGate = () => retrieveAvailability({
    state: store.getState(), recipe: applied(), evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()
}).gate

const operationGate = operation => operation === IMAGE_OUTPUT
    ? requestGate({state: store.getState(), recipe: applied(), operation, evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()})
    : pixelOperationsAvailability({state: store.getState(), recipe: applied(), heldFor: key => runtime.heldFor(key), operations: [operation]}).gate

const countGate = () => mapProductGate({state: store.getState(), recipe: applied(), product: {name: 'COUNT'}, heldFor: key => runtime.heldFor(key)})

const field = label => document.querySelector(`[data-label="${label}"]`)

// The choices a field offers, by name: its buttons but the one marking its errors, which names nothing.
const choiceButtons = label => [...field(label).querySelectorAll('button')].filter(({textContent}) => textContent)

const choicesOf = label => choiceButtons(label).map(({textContent}) => textContent)

const chosenOf = label => choiceButtons(label)
    .filter(({className}) => /_highlight_/.test(className))
    .map(({textContent}) => textContent)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label)?.querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const inError = label => button(label).classList.contains(classOf(toolbarButtonStyles, 'error'))

// What a section's toolbar button says of it.
const buttonTooltip = label => [...document.querySelectorAll('[data-tooltip]')]
    .filter(element => element.contains(button(label)) || button(label).contains(element))
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .join(' | ')

const classOf = (styles, name) => {
    if (!styles[name]) {
        throw new Error(`No ${name} class to look for`)
    }
    return styles[name].split(' ')[0]
}

const press = async label => {
    await act(async () => button(label).click())
    await settled()
}

const toggle = async (label, band) => {
    await act(async () => [...field(label).querySelectorAll('button')].find(({textContent}) => textContent === band).click())
    await settled()
}

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open({breakpointBands, tmaskBands, options, panels}) {
    const recipe = ccdcRecipe({breakpointBands, tmaskBands, options})
    fake.stored = {[CCDC]: recipe}
    fake.open = new Set(panels)
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[CCDC]: recipe},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: CCDC}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <RuntimeProbe/>
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <Recipe id={CCDC}>
                            <Root/>
                        </Recipe>
                    </EventShield>
                </PortalContext>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
