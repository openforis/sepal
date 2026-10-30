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
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// A Sources draft judged, before Apply, by what PyEO's shared definition requires of it (sourcesRequirements.js,
// outputCandidate.js): the real panel, its form and its requirements over a real store and source runtime; the recipe
// and asset reads are the substitutes.

const assetMetadata$ = vi.fn()
const bands$ = vi.fn()
const loadRecipe$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        assetMetadata$: (...args) => assetMetadata$(...args),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        bands$: (...args) => bands$(...args)
    },
    recipe: {load$: (...args) => loadRecipe$(...args), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, args) => [key, ...(args ? Object.values(args) : [])].join(' ')}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => msg ? <><span data-message>{[msg].flat().map(tooltipText).join(' ')}</span>{children}</> : children
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
const {sourcesRequirements} = await import('../../sourcesRequirements')
registry.PYEO_ALERTS = {id: 'PYEO_ALERTS', sourceRequirements: sourcesRequirements}
registry.CLASSIFICATION = {id: 'CLASSIFICATION'}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
})

it('refuses Apply for a draft classification whose classifier the monitoring data cannot feed, saying so beside it', async () => {
    await open()

    await select(RADAR)
    await chooseChangeClasses()

    expect(classificationMessages()).toContainEqual(expect.stringContaining('classification.unsuppliedInputs'))
    expect(applyButton().disabled).toBe(true)
    expect(store.getState().process.loadedRecipes[ID].model.sources.classification).toBe(OPTICAL)
})

it('applies a draft classification the monitoring data can feed', async () => {
    await open()

    await select(OTHER_OPTICAL)
    await chooseChangeClasses()

    expect(applyButton().disabled).toBe(false)
    await act(async () => applyButton().click())
    expect(store.getState().process.loadedRecipes[ID].model.sources.classification).toBe(OTHER_OPTICAL)
})

const ID = 'pyeo-1'
const OPTICAL = 'classification-optical'
const OTHER_OPTICAL = 'classification-other-optical'
const RADAR = 'classification-radar'

// Over an asset holding the bands it selects. Only a trained one - a classifier and points to train it on - is a
// Classification PyEO can run.
const classificationOver = (id, included, {trained = false} = {}) => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        legend: {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Non-forest'}]},
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: `users/x/${id}`, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
        ...(trained && {
            classifier: {type: 'RANDOM_FOREST'},
            trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]}
        })
    }
})

const CLASSIFICATIONS = [
    classificationOver(OPTICAL, ['red', 'nir']),
    classificationOver(OTHER_OPTICAL, ['red', 'nir', 'swir1'], {trained: true}),
    classificationOver(RADAR, ['VV_mean', 'VH_med'])
]

// Earth Engine's description of each Classification's input asset: the bands its band set selects.
const inputBandsOf = asset => CLASSIFICATIONS
    .find(({model}) => model.inputImagery.images[0].id === asset)
    ?.model.inputImagery.images[0].bandSetSpecs[0].included

async function open() {
    loadRecipe$.mockImplementation(id => of(CLASSIFICATIONS.find(record => record.id === id)))
    assetMetadata$.mockImplementation(() => of({bandNames: ['B1'], properties: {}}))
    bands$.mockImplementation(({asset}) => of((inputBandsOf(asset) || ['B1']).map(name => ({name, arrayDimensions: 0}))))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID,
                    type: 'PYEO_ALERTS',
                    model: {
                        sources: {classification: OPTICAL, dataSets: {LANDSAT: ['LANDSAT_9']}, cloudPercentageThreshold: 75, changeFromClasses: [1], changeToClasses: [2]},
                        options: {corrections: ['SR']},
                        dates: {monitoringStart: '2024-01-01', monitoringEnd: '2025-01-01'}
                    },
                    ui: {}
                },
                ...Object.fromEntries(CLASSIFICATIONS.map(record => [record.id, record]))
            },
            recipes: CLASSIFICATIONS.map(({id}) => ({id, name: id, type: 'CLASSIFICATION', revision: 1})),
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            folders: [],
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

const select = async id => {
    await act(async () => document.querySelector('input').click())
    const option = [...document.querySelectorAll('li')].map(item => item.firstElementChild).find(item => item?.textContent === id)
    expect(option, `no option for ${id}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const buttonsLabelled = label => [...document.querySelectorAll('button')].filter(button => button.textContent === label)

const chooseChangeClasses = async () => {
    await act(async () => buttonsLabelled('Forest')[0].click())
    await act(async () => buttonsLabelled('Non-forest')[1].click())
    await settled()
}

const applyButton = () => buttonsLabelled('button.apply')[0]

const classificationMessages = () => [...document.querySelectorAll(
    '[data-label="process.pyeoAlerts.panel.sources.form.classification.label"] [data-message]'
)].map(({textContent}) => textContent)
