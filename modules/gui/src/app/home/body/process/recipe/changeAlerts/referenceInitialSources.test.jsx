import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import {TabContext} from '~/widget/tabs/tabContext'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

import {segmentsAssetMetadata} from './observedReference.test.fixtures'

// A new Change Alerts recipe's Sources start from what the reference first applied to it prefers, captured as that
// Reference commits (reference.jsx): the data sets its metadata records it was fitted from; else those of the monitoring
// type it records; else those of the first type able to observe a measure its segments were fitted for, optical before
// radar. They are resolved against the recipe's calibration and monitoring years as Sources first open
// (initialSources.js). A reference replacing one already applied seeds nothing, and Sources already committed keep what
// they hold. The root, toolbar, wizard, activation, Reference asset picker, Date and Sources panels, store and source
// runtime are real; Earth Engine answers with fixed asset metadata, and the map is not drawn.

const fake = vi.hoisted(() => ({assets: {}}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        assetMetadata$: ({asset}) => of(fake.assets[asset]),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        bands$: ({asset}) => of((fake.assets[asset]?.bandNames || []).map(name => ({name, arrayDimensions: 0}))),
        datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
    },
    recipe: {load$: () => of(null), loadAll$: () => of([]), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => {
    const text = [key].flat().join('.')
    return values && Object.keys(values).length ? `${text} ${JSON.stringify(values)}` : text
}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().map(tooltipText).some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().map(tooltipText).filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
vi.mock('~/app/home/map/map', async importOriginal => ({...await importOriginal(), Map: ({children}) => children}))
vi.mock('~/app/home/body/process/recipe/map/aoi', async importOriginal => ({...await importOriginal(), Aoi: () => null}))
vi.mock('~/app/home/body/process/recipe/map/recipeImageLayerSource', async importOriginal => ({...await importOriginal(), initializeLayers: () => {}}))
vi.mock('~/app/home/body/process/recipe/ccdc/ccdcRecipe', () => ({getAllVisualizations: () => []}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: changeAlerts} = await import('./changeAlerts')
addRecipeType(changeAlerts())
const ChangeAlerts = changeAlerts().components.recipe

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'alerts-1'
const RADAR_ASSET = 'users/x/radar-segments'
const OPTICAL_ASSET = 'users/x/optical-segments'
const S1 = 'SENTINEL_1'
const SOURCES = 'process.changeAlerts.panel.sources.form'

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    fake.assets = {}
})

describe('a new Change Alerts recipe set up from a radar segments asset', () => {
    it.each([
        ['records no data sets', {}],
        ['records the monitoring type alone', {recipe_sources: JSON.stringify({dataSetType: 'RADAR'})}],
        ['records the data sets it was fitted from', {recipe_sources: JSON.stringify({dataSetType: 'RADAR', dataSets: {SENTINEL_1: [S1]}})}]
    ])('whose metadata %s starts Sources on radar Sentinel-1', async (_case, properties) => {
        fake.assets[RADAR_ASSET] = segmentsAssetMetadata({band: 'VV', properties: {dateFormat: 1, ...properties}})
        await create()

        await selectAsset(RADAR_ASSET)
        await press('button.next')
        await press('button.next')

        expect(chosen(`${SOURCES}.dataSetType.label`)).toEqual([`${SOURCES}.dataSetTypes.RADAR`])
        expect(chosen(`${SOURCES}.dataSets.label`)).toEqual([dataSetLabel(S1)])
        expect(alerts().model.sources.dataSets).toBeUndefined()
    })

    it('finishes set-up monitoring Sentinel-1 for the band it was fitted for', async () => {
        fake.assets[RADAR_ASSET] = segmentsAssetMetadata({band: 'VV', properties: {dateFormat: 1}})
        await create()
        await selectAsset(RADAR_ASSET)
        await press('button.next')
        await press('button.next')

        await toggle(`${SOURCES}.band.label`, 'VV')
        await press('button.done')

        expect(alerts().model.sources).toMatchObject({dataSetType: 'RADAR', dataSets: {SENTINEL_1: [S1]}, band: 'VV'})
        expect(alerts().ui.initialized).toBe(true)
    })
})

describe('a new Change Alerts recipe set up from an optical segments asset', () => {
    it('whose metadata records no data sets starts Sources with the usual optical data sets that may contribute', async () => {
        fake.assets[OPTICAL_ASSET] = segmentsAssetMetadata({band: 'ndvi', properties: {dateFormat: 1}})
        await create()

        await selectAsset(OPTICAL_ASSET)
        await press('button.next')
        await press('button.next')

        expect(chosen(`${SOURCES}.dataSetType.label`)).toEqual([`${SOURCES}.dataSetTypes.OPTICAL`])
        expect(chosen(`${SOURCES}.dataSets.label`)).toEqual(['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'SENTINEL_2'].map(dataSetLabel))
    })

    it('whose metadata records the data sets it was fitted from starts Sources with those', async () => {
        fake.assets[OPTICAL_ASSET] = segmentsAssetMetadata({band: 'ndvi', properties: {dateFormat: 1, recipe_sources: JSON.stringify({dataSets: {LANDSAT: ['LANDSAT_8']}})}})
        await create()

        await selectAsset(OPTICAL_ASSET)
        await press('button.next')
        await press('button.next')

        expect(chosen(`${SOURCES}.dataSets.label`)).toEqual([dataSetLabel('LANDSAT_8')])
    })
})

describe('a new Change Alerts recipe set up from a segments asset recording only Planet as its monitoring type', () => {
    it('starts Sources on Planet, though optical data would observe what it was fitted for', async () => {
        fake.assets[OPTICAL_ASSET] = segmentsAssetMetadata({band: 'ndvi', properties: {dateFormat: 1, recipe_sources: JSON.stringify({dataSetType: 'PLANET'})}})
        await create()

        await selectAsset(OPTICAL_ASSET)
        await press('button.next')
        await press('button.next')

        expect(chosen(`${SOURCES}.dataSetType.label`)).toEqual([`${SOURCES}.dataSetTypes.PLANET`])
    })
})

describe('a Change Alerts recipe being set up whose Sources were committed', () => {
    it('keeps them when a radar asset replaces its reference', async () => {
        fake.assets[OPTICAL_ASSET] = segmentsAssetMetadata({band: 'ndvi', properties: {dateFormat: 1}})
        fake.assets[RADAR_ASSET] = segmentsAssetMetadata({band: 'VV', properties: {dateFormat: 1}})
        await create({
            reference: {type: 'ASSET', id: OPTICAL_ASSET, dateFormat: 1},
            sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75, band: 'ndvi'}
        })

        await selectAsset(RADAR_ASSET)
        await press('button.next')
        await press('button.next')

        expect(alerts().model.reference.id).toBe(RADAR_ASSET)
        expect(chosen(`${SOURCES}.dataSets.label`)).toEqual([dataSetLabel('LANDSAT_8')])
        expect(alerts().model.sources.dataSets).toEqual({LANDSAT: ['LANDSAT_8']})
    })
})

const alerts = () => selectFrom(store.getState(), ['process.loadedRecipes', ID])

const dataSetLabel = dataSet => `sources.dataSets.${dataSet}.label`

const field = label => container.querySelector(`[data-label="${label}"]`)

const optionsOf = label => [...(field(label)?.querySelectorAll('button') || [])]
    .filter(button => !button.closest('[data-feedback]') && button.textContent)

const chosen = label => optionsOf(label).filter(({className}) => /_highlight_/.test(className)).map(({textContent}) => textContent)

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const press = async label => {
    expect(button(label), `no button ${label}`).toBeDefined()
    await act(async () => button(label).click())
    await settled()
}

const toggle = async (label, option) => {
    const found = optionsOf(label).find(({textContent}) => textContent === option)
    expect(found, `no ${option} in ${label}`).toBeDefined()
    await act(async () => found.click())
    await settled()
}

// As a user selects an asset in REF: the kind of reference, then the asset, typed into the picker and chosen from it.
const selectAsset = async id => {
    if (!field('process.changeAlerts.panel.reference.form.asset.label')) {
        await press('process.sourceType.ASSET')
    }
    const input = field('process.changeAlerts.panel.reference.form.asset.label').querySelector('input')
    await act(async () => input.click())
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, id)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    const option = [...document.querySelectorAll('[data-hook="option"]')].find(element => element.textContent === id)
    expect(option, `no option for ${id}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

// As created (createRecipe.jsx), its root giving it its default model - or, where given, a model it was already set up
// with as far as its reference and Sources.
async function create(model) {
    const recipe = {id: ID, type: 'CHANGE_ALERTS', placeholder: 'alerts', ui: {unsaved: true}}
    const {defaultModel} = await import('./changeAlertsRecipe')
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        assets: {user: [RADAR_ASSET, OPTICAL_ASSET].map(id => ({id, type: 'Image', updateTime: 'T1'})), other: []},
        process: {
            loadedRecipes: {[ID]: model ? {...recipe, model: {...defaultModel, ...model}} : recipe},
            recipes: [],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID, type: 'CHANGE_ALERTS'}],
            selectedTabId: ID
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
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <ActivationContext id='root'>
                            <Recipe id={ID}>
                                <TabContext id={ID} busyIn$={new Subject()}>
                                    <ChangeAlerts/>
                                </TabContext>
                            </Recipe>
                        </ActivationContext>
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
