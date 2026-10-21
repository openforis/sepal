import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// CCDC's breakpoint bands and Phenology's band, in their Sources panels, saved choosing a regression the selected
// Classification's SVM does not provide (classifiedOutputRequirements, collectionClassifierRequirements.js): the real
// panels, forms and requirements over a real store and source runtime; recipe reads are the substitutes. What is
// saved is shown as saved, said wrong beside the field, until a choice the Classification provides repairs it.

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

const {Sources: CcdcSources} = await import('./ccdc/panels/sources/sources')
const {Sources: PhenologySources} = await import('./phenology/panels/sources/sources')
const {classifiedOutputRequirements, collectionClassifierRequirements} = await import('./collectionClassifierRequirements')
const SOURCES = {id: 'sources', label: 'sources'}
registry.CCDC = {id: 'CCDC', sourceRequirements: [...collectionClassifierRequirements(SOURCES), classifiedOutputRequirements(SOURCES, 'breakpointBands')]}
registry.PHENOLOGY = {id: 'PHENOLOGY', sourceRequirements: [...collectionClassifierRequirements(SOURCES), classifiedOutputRequirements(SOURCES, 'band')]}
registry.CLASSIFICATION = {id: 'CLASSIFICATION'}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
})

describe.each([
    {
        type: 'CCDC',
        Sources: CcdcSources,
        field: 'breakpointBands',
        label: 'process.ccdc.panel.sources.form.breakpointBands.label',
        saved: ['regression'],
        repair: async () => {
            await press('regression')
            await press('blue')
        },
        repaired: ['blue']
    },
    {
        type: 'PHENOLOGY',
        Sources: PhenologySources,
        field: 'band',
        label: 'process.phenology.panel.sources.form.band.label',
        saved: 'regression',
        repair: () => press('blue'),
        repaired: 'blue'
    }
])('$type Sources saved choosing a regression its classification\'s SVM does not provide', ({type, Sources, field, label, saved, repair, repaired}) => {
    it('opens unedited, keeping what is saved and saying beside the field why it cannot be used', async () => {
        await open({type, Sources, sources: {[field]: saved}})

        expect(messagesOf(label)).toContainEqual(expect.stringContaining(`classifiedOutputs.${field}`))
        expect(button('button.apply')).toBeUndefined()
        expect(savedSources()[field]).toEqual(saved)
    })

    // The form drops a choice none of its options offers whenever it renders again (form/buttons.jsx). CCDC holds More in
    // its form, so showing it is an edit there; either way, the saved choice is kept, and nothing can be applied over it.
    it('keeps the saved choice, explained, when the panel renders again, as on showing More', async () => {
        await open({type, Sources, sources: {[field]: saved}})

        await press('button.more')

        expect(messagesOf(label)).toContainEqual(expect.stringContaining(`classifiedOutputs.${field}`))
        expect(applyHeld()).toBe(true)
    })

    it('is repaired by a choice the classification provides, which clears the explanation and Apply saves', async () => {
        await open({type, Sources, sources: {[field]: saved}})

        await repair()

        expect(messagesOf(label)).toEqual([])
        expect(button('button.apply').disabled).toBe(false)
        await press('button.apply')
        expect(savedSources()[field]).toEqual(repaired)
    })

    it('keeps what was applied on Cancel', async () => {
        await open({type, Sources, sources: {[field]: saved}})
        await repair()

        await press('button.cancel')

        expect(savedSources()[field]).toEqual(saved)
    })
})

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-svm'

// An SVM classifying C_SVC over optical bands Landsat supplies: it provides class probabilities, and no regression.
const SVM = {
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        legend: {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Non-forest'}]},
        classifier: {type: 'SVM', svmType: 'C_SVC'},
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]}
    }
}

async function open({type, Sources, sources}) {
    loadRecipe$.mockImplementation(id => of(id === CLASSIFICATION ? SVM : undefined))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID,
                    type,
                    model: {
                        dates: {startDate: '2015-01-01', endDate: '2021-01-01', fromYear: 2019, toYear: 2020},
                        sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], classification: CLASSIFICATION, ...sources},
                        options: {corrections: ['SR']}
                    },
                    ui: {initialized: true}
                },
                [CLASSIFICATION]: SVM
            },
            recipes: [{id: CLASSIFICATION, name: CLASSIFICATION, type: 'CLASSIFICATION', revision: 1}],
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

const applyHeld = () => !button('button.apply') || button('button.apply').disabled

const messagesOf = label => [...document.querySelectorAll(`[data-label="${label}"] [data-message]`)].map(({textContent}) => textContent)
    .filter(message => message.includes('classifiedOutputs'))
