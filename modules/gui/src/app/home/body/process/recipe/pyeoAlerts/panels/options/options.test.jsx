import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// OPT's index gate over a real store and form: an index the classification's imagery and the monitoring data cannot
// both compute is said beside the index, never switched off for the user, and opening OPT edits nothing. What is not
// yet known of the imagery rules nothing out.

vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// Cuts an import cycle the form barrel would otherwise enter from the wrong side; nothing here renders one.
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => msg ? <><span data-message>{[msg].flat().join(' ')}</span>{children}</> : children
}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))

const {Options} = await import('./options')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
})

describe('OPT opened unedited', () => {
    it('offers no Apply, saying beside the index that imagery without the bands for any index cannot gate', async () => {
        await open({bands: RADAR_BANDS, gate: {index: 'ndvi', threshold: 0.2}})

        expect(applyOffered()).toBe(false)
        expect(gateIndexErrors()).toEqual([expect.stringContaining(UNSUPPORTED)])
        expect(gateIndexErrors()[0]).toContain('NDVI')
    })

    it('offers no Apply and says nothing for optical imagery computing the saved index', async () => {
        await open({bands: OPTICAL_BANDS, gate: {index: 'nbr', threshold: 0.3}})

        expect(applyOffered()).toBe(false)
        expect(gateIndexErrors()).toEqual([])
    })

    it('keeps an index the imagery cannot compute beside one it can, saying so', async () => {
        await open({bands: ['red', 'nir'], gate: {index: 'nbr', threshold: 0.3}})

        expect(applyOffered()).toBe(false)
        expect(selectedGateIndex()).toBe('NBR')
        expect(gateIndexErrors()).toEqual([expect.stringContaining(UNSUPPORTED)])
    })

    it('says nothing, and offers no Apply, with the gate off over imagery that cannot gate', async () => {
        await open({bands: RADAR_BANDS, gate: undefined})

        expect(applyOffered()).toBe(false)
        expect(gateIndexErrors()).toEqual([])
        expect(gateButton('process.pyeoAlerts.panel.options.form.useIndexGate.on').disabled).toBe(true)
    })

    it('rules nothing out while the classification\'s bands are not yet known', async () => {
        await open({bands: undefined, gate: {index: 'nbr', threshold: 0.3}})

        expect(applyOffered()).toBe(false)
        expect(gateIndexErrors()).toEqual([])
    })
})

// As execution obtains the baseline index: calculated from an asset's spectral bands, asked of a recipe by name.
describe('the index a recipe input is asked for', () => {
    it('is one it supplies by name, not one it could be calculated from', async () => {
        await open({bands: ['red', 'nir', 'nbr'], type: 'RECIPE_REF', gate: {index: 'ndvi', threshold: 0.2}})

        expect(gateIndexErrors()).toEqual([expect.stringContaining(UNSUPPORTED)])

        await chooseGateIndex('NBR')
        expect(gateIndexErrors()).toEqual([])
    })
})

describe('bands read for another classification than the one applied', () => {
    it('rule nothing out', async () => {
        await open({bands: RADAR_BANDS, readFor: 'classification-2', gate: {index: 'ndvi', threshold: 0.2}})

        expect(applyOffered()).toBe(false)
        expect(gateIndexErrors()).toEqual([])
    })
})

describe('a gate turned on with no index saved', () => {
    it('takes NDVI where the imagery supports it', async () => {
        await open({bands: OPTICAL_BANDS, gate: undefined})

        await press('process.pyeoAlerts.panel.options.form.useIndexGate.on')
        await press('button.apply')

        expect(savedOptions().indexGate.index).toBe('ndvi')
    })

    it('takes an index the imagery supports where NDVI is not', async () => {
        await open({bands: ['nir', 'swir2'], gate: undefined})

        await press('process.pyeoAlerts.panel.options.form.useIndexGate.on')
        await press('button.apply')

        expect(savedOptions().indexGate.index).toBe('nbr')
    })
})

describe('an index the imagery cannot compute', () => {
    it('is repaired by choosing one it can, which Apply saves', async () => {
        await open({bands: ['red', 'nir'], gate: {index: 'nbr', threshold: 0.3}})

        await chooseGateIndex('NDVI')

        expect(gateIndexErrors()).toEqual([])
        await press('button.apply')
        expect(savedOptions().indexGate).toEqual({index: 'ndvi', threshold: 0.3})
    })

    it('is repaired by turning the gate off, which Apply saves', async () => {
        await open({bands: RADAR_BANDS, gate: {index: 'ndvi', threshold: 0.2}})

        await press('process.pyeoAlerts.panel.options.form.useIndexGate.off')
        await press('button.apply')

        expect(savedOptions().indexGate).toBeUndefined()
    })

    it('is left as saved when the repair is cancelled', async () => {
        await open({bands: RADAR_BANDS, gate: {index: 'ndvi', threshold: 0.2}})

        await press('process.pyeoAlerts.panel.options.form.useIndexGate.off')
        await press('button.cancel')

        expect(savedOptions().indexGate).toEqual({index: 'ndvi', threshold: 0.2})
    })
})

const ID = 'pyeo-1'
const CLASSIFICATION = 'classification-1'
const UNSUPPORTED = 'process.pyeoAlerts.panel.options.form.gateIndex.unsupported'
const RADAR_BANDS = ['VV', 'VH']
const OPTICAL_BANDS = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
const INDEX_LABEL = 'process.pyeoAlerts.panel.options.form.gateIndex.label'

// `bands` read of the classification's input - an asset unless `type` says otherwise - for `readFor`, the classification
// applied unless another is named.
async function open({bands, gate, type = 'ASSET', readFor = CLASSIFICATION}) {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {[ID]: {
                id: ID,
                type: 'PYEO_ALERTS',
                model: {
                    sources: {classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}},
                    pyeoAlertsOptions: {minConsecutiveDetections: 2, ...(gate && {indexGate: gate})}
                },
                ui: {classificationBands: bands && {classification: readFor, type, bands}}
            }},
            recipes: [],
            projects: [],
            tabs: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <EventShield>
                <PortalContainer/>
                <PortalContainer id='panels'/>
                <PortalContext id='panels'>
                    <Recipe id={ID}>
                        <Options/>
                    </Recipe>
                </PortalContext>
            </EventShield>
        </Provider>
    ))
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

const savedOptions = () => store.getState().process.loadedRecipes[ID].model.pyeoAlertsOptions

const buttons = () => [...document.querySelectorAll('button')]

const press = async label => {
    const button = buttons().find(button => button.textContent === label)
    expect(button, `no button ${label}`).toBeDefined()
    await act(async () => button.click())
    await settled()
}

const gateButton = label => buttons().find(button => button.textContent === label)

// An unedited panel offers Close rather than Apply.
const applyOffered = () => !!buttons().find(button => button.textContent === 'button.apply')

const field = label => document.querySelector(`[data-label="${label}"]`)

// What the index's label says as errors: shown only while it marks one.
const gateIndexErrors = () => field(INDEX_LABEL)?.querySelector('[data-feedback="error"]')
    ? [...field(INDEX_LABEL).querySelectorAll('[data-message]')].map(({textContent}) => textContent)
        .filter(message => /gateIndex\.(unsupported|required)/.test(message))
    : []

const selectedGateIndex = () => {
    const input = field(INDEX_LABEL).querySelector('input')
    return input.value || input.placeholder
}

const chooseGateIndex = async label => {
    await act(async () => field(INDEX_LABEL).querySelector('input').click())
    await settled()
    const option = [...document.querySelectorAll('[data-hook="option"]')].find(option => option.textContent === label)
    expect(option, `no option ${label}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}
