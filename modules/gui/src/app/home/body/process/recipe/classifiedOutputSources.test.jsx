import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, ReplaySubject} from 'rxjs'
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
            await press(REGRESSION)
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
    // Sources opening on More, as CCDC's do while a Classification is selected, show Less first.
    it('keeps the saved choice, explained, when the panel renders again, as on showing More', async () => {
        await open({type, Sources, sources: {[field]: saved}})

        button('button.less') && await press('button.less')
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

// What a classified output it chose is called, as its choice and the finding refusing it say it: as the Classification
// selected now names it, otherwise as the one selected before did, otherwise by its class - never by its identifier. The
// name says nothing of whether it is provided: the finding and its hold on Apply are the shared rule's alone.
describe.each([
    {type: 'CCDC', Sources: CcdcSources, field: 'breakpointBands', label: 'process.ccdc.panel.sources.form.breakpointBands.label', classificationLabel: 'process.ccdc.panel.sources.form.classification.label', ofImages: ['blue']},
    {type: 'PHENOLOGY', Sources: PhenologySources, field: 'band', label: 'process.phenology.panel.sources.form.band.label', classificationLabel: 'process.phenology.panel.sources.form.classification.label', ofImages: 'blue'}
])('$type Sources naming a class probability chosen', ({type, Sources, field, label, classificationLabel, ofImages}) => {
    it('keep the name an output chosen of one Classification had, once another that does not provide it is selected, Apply refused', async () => {
        await open({type, Sources, sources: {classification: A.id, [field]: ofImages}, records: CLASSES})

        await press(probabilityOf('A'))
        await selectClassification(classificationLabel, B.id)

        expect(chosenAt(label)).toContain(probabilityOf('A'))
        expect(messagesOf(label)).toEqual([`process.source.classifiedOutputs.${field} ${probabilityOf('A')}`])
        expect(shownAt(label)).not.toContain('probability_1')
        expect(applyHeld()).toBe(true)
    })

    it('name one no Classification selected names by its class, never by its identifier', async () => {
        await open({type, Sources, sources: {classification: B.id, [field]: chosen(field, 'probability_1')}, records: CLASSES})

        expect(chosenAt(label)).toContain(CLASS_1_PROBABILITY)
        expect(messagesOf(label)).toEqual([`process.source.classifiedOutputs.${field} ${CLASS_1_PROBABILITY}`])
        expect(shownAt(label)).not.toContain('probability_1')
    })

    it('name it as the Classification selected now does, where that one provides it, refusing nothing', async () => {
        await open({type, Sources, sources: {classification: A.id, [field]: ofImages}, records: CLASSES})

        await press(probabilityOf('A'))
        await selectClassification(classificationLabel, RENAMED.id)

        expect(chosenAt(label)).toContain(probabilityOf('C'))
        expect(shownAt(label)).not.toContain(probabilityOf('A'))
        expect(messagesOf(label)).toEqual([])
        expect(applyHeld()).toBe(false)
    })

    it('keep it, named by its class, while the Classification is read, refuse it by that name once read, and are repaired by another choice', async () => {
        const read = new ReplaySubject(1)
        await open({type, Sources, sources: {classification: B.id, [field]: chosen(field, 'probability_1')}, records: CLASSES, load$: () => read})

        expect(chosenAt(label)).toContain(CLASS_1_PROBABILITY)
        expect(messagesOf(label)).toEqual([])

        await act(async () => {
            read.next(B)
            read.complete()
        })
        await settled()
        expect(chosenAt(label)).toContain(CLASS_1_PROBABILITY)
        expect(messagesOf(label)).toEqual([`process.source.classifiedOutputs.${field} ${CLASS_1_PROBABILITY}`])

        await press('blue')
        type === 'CCDC' && await press(CLASS_1_PROBABILITY)

        expect(messagesOf(label)).toEqual([])
        expect(button('button.apply').disabled).toBe(false)
    })
})

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-svm'
const CLASS_1_PROBABILITY = 'process.classification.bands.classValueProbability 1'

const probabilityOf = classLabel => `process.classification.bands.probability ${classLabel}`

// A Random Forest over optical bands Landsat supplies, providing a probability for each of its classes.
const randomForestOf = (id, entries) => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        legend: {entries: entries.map(([value, label]) => ({value, label}))},
        classifier: {type: 'RANDOM_FOREST'},
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]}
    }
})
const A = randomForestOf('classification-a', [[1, 'A'], [2, 'B']])
const B = randomForestOf('classification-b', [[3, 'C'], [4, 'D']])
const RENAMED = randomForestOf('classification-renamed', [[1, 'C'], [2, 'D']])
const CLASSES = {[A.id]: A, [B.id]: B, [RENAMED.id]: RENAMED}

// What a field choosing one band, or several, holds choosing `band`.
const chosen = (field, band) => field === 'band' ? band : [band]
const REGRESSION = 'process.classification.bands.regression'

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

// `records` are what storage holds, its reads answered at once unless `load$` answers them; the session holds the SVM alone.
async function open({type, Sources, sources, records = {[CLASSIFICATION]: SVM}, load$ = id => of(records[id])}) {
    loadRecipe$.mockImplementation(load$)
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
            recipes: [CLASSIFICATION, ...Object.keys(records)].map(id => ({id, name: id, type: 'CLASSIFICATION', revision: 1})),
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

const chosenAt = label => [...document.querySelectorAll(`[data-label="${label}"] button`)]
    .filter(button => /_highlight_/.test(button.className))
    .map(({textContent}) => textContent)

const shownAt = label => [...document.querySelectorAll(`[data-label="${label}"]`)].map(({textContent}) => textContent).join(' ')

const selectClassification = async (label, name) => {
    button('button.more') && await press('button.more')
    const input = document.querySelector(`[data-label="${label}"] input`)
    await act(async () => input.click())
    const option = [...document.querySelectorAll('li')].map(item => item.firstElementChild).find(item => item?.textContent === name)
    expect(option, `no option for ${name}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const messagesOf = label => [...document.querySelectorAll(`[data-label="${label}"] [data-message]`)].map(({textContent}) => textContent)
    .filter(message => message.includes('classifiedOutputs'))
