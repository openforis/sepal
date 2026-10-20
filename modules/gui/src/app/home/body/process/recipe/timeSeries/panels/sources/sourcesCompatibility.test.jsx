import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// A Time Series Sources draft judged, before Apply, by whether its collection's images can feed the classifier of the
// Classification it selects (collectionClassifierRequirements.js, outputCandidate.js): the real panel, form and
// requirements over a real store and source runtime; recipe reads are the substitutes. The Classification is chosen
// under More, and is shown outside it while what is selected cannot be used.

const loadRecipe$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {
    gee: {assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})},
    recipe: {load$: (...args) => loadRecipe$(...args), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, args) => [key, ...(args ? Object.values(args) : [])].join(' ')}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => msg ? <><span data-message>{[msg].flat().join(' ')}</span>{children}</> : children
}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
// Filled in once the declarations are imported: importing them from within the mock would never resolve.
const registry = vi.hoisted(() => ({}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: type => registry[type]}))

const {Sources} = await import('./sources')
const {collectionClassifierRequirements} = await import('../../../collectionClassifierRequirements')
registry.TIME_SERIES = {id: 'TIME_SERIES', sourceRequirements: collectionClassifierRequirements({id: 'sources', label: 'process.timeSeries.panel.sources.button'})}
registry.CLASSIFICATION = {id: 'CLASSIFICATION'}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
})

it('refuses Apply for a classification the images cannot feed, saying so beside it, and keeps what was applied on Cancel', async () => {
    await open()
    await press('button.more')

    await select(RADAR_STATISTICS)

    expect(classificationMessages()).toContainEqual(expect.stringContaining('classifierInputs.classification'))
    expect(button('button.apply').disabled).toBe(true)
    await press('button.cancel')
    expect(savedSources().classification).toBeUndefined()
})

it('is repaired by a collection that can feed it, which Apply saves', async () => {
    await open()
    await press('button.more')
    await select(RADAR_POLARISATIONS)
    expect(dataSetMessages()).toContainEqual(expect.stringContaining('classifierInputs.dataSets'))
    expect(button('button.apply').disabled).toBe(true)

    await press('process.ccdc.panel.sources.form.dataSetTypes.RADAR')

    expect(dataSetMessages()).toEqual([])
    expect(button('button.apply').disabled).toBe(false)
    await press('button.apply')
    expect(savedSources()).toMatchObject({classification: RADAR_POLARISATIONS, dataSets: {SENTINEL_1: ['SENTINEL_1']}})
})

it('shows a saved classification the images cannot feed outside More, saying why', async () => {
    await open({classification: RADAR_STATISTICS})

    expect(button('button.more')).toBeDefined()
    expect(classificationMessages()).toContainEqual(expect.stringContaining('classifierInputs.classification'))
    expect(button('button.apply')).toBeUndefined()
})

const ID = 'time-series-1'
const RADAR_STATISTICS = 'classification-radar-statistics'
const RADAR_POLARISATIONS = 'classification-radar-polarisations'

const classificationOver = (id, included) => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        legend: {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Non-forest'}]},
        classifier: {type: 'RANDOM_FOREST'},
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: `users/x/${id}`, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}
    }
})

const CLASSIFICATIONS = [
    classificationOver(RADAR_STATISTICS, ['VV_mean', 'VH_med']),
    classificationOver(RADAR_POLARISATIONS, ['VV', 'VH'])
]

async function open(sources = {}) {
    loadRecipe$.mockImplementation(id => of(CLASSIFICATIONS.find(record => record.id === id)))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID,
                    type: 'TIME_SERIES',
                    model: {
                        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
                        sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], ...sources},
                        options: {corrections: ['SR']}
                    },
                    ui: {initialized: true}
                },
                ...Object.fromEntries(CLASSIFICATIONS.map(record => [record.id, record]))
            },
            recipes: CLASSIFICATIONS.map(({id}) => ({id, name: id, type: 'CLASSIFICATION', revision: 1})),
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
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
            <SourceRuntimeProvider>
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <Recipe id={ID}>
                            <Sources/>
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

const savedSources = () => store.getState().process.loadedRecipes[ID].model.sources

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const press = async label => {
    expect(button(label), `no button ${label}`).toBeDefined()
    await act(async () => button(label).click())
    await settled()
}

const select = async id => {
    const input = document.querySelector('[data-label="process.timeSeries.panel.sources.form.classification.label"] input')
    await act(async () => input.click())
    const option = [...document.querySelectorAll('li')].map(item => item.firstElementChild).find(item => item?.textContent === id)
    expect(option, `no option for ${id}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const messagesOf = label => [...document.querySelectorAll(`[data-label="${label}"] [data-message]`)].map(({textContent}) => textContent)
    .filter(message => message.includes('classifierInputs'))

const classificationMessages = () => messagesOf('process.timeSeries.panel.sources.form.classification.label')

const dataSetMessages = () => messagesOf('process.ccdc.panel.sources.form.dataSets.label')
