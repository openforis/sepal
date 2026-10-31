import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// A Phenology analysing a band its selected Classification computes trains that Classification's classifier: where it
// cannot be trained - it stores no training points - the Sources panel names it beside the classification field, whose
// own sections say why, and Retrieve is held, while holding the panel's Apply. A band of the images needs nothing of
// it. The panel, store, source runtime and recipe types are real; the recipe reads answer from stored records, Earth
// Engine an asset's bands at once.

const stored = vi.hoisted(() => ({records: {}}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => of(['red', 'nir'].map(name => ({name, arrayDimensions: 0}))),
        assetMetadata$: () => of({bandNames: ['red', 'nir'], properties: {}}),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {load$: id => of(stored.records[id]), loadAll$: () => of(LISTING), save$: () => of()}
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
// The Sources panel is open.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: phenology} = await import('./phenology')
const {default: classification} = await import('../classification/classification')
const {default: opticalMosaic} = await import('../opticalMosaic/opticalMosaic')
const {Sources} = await import('./panels/sources/sources')
const {retrieveAvailability} = await import('../operationAvailability')

addRecipeType(phenology())
addRecipeType(classification())
addRecipeType(opticalMosaic())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a Phenology analysing a band its Classification computes, by whether that Classification stores training points', () => {
    it('names the Classification beside the classification field, and holds Retrieve, while it cannot be trained', async () => {
        await open({band: 'probability_1', classifier: RANDOM_FOREST, points: false})

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([NEEDS_ATTENTION])
        expect(buttonLabelled('button.apply')).toBeUndefined()
        expect(buttonLabelled('button.close').disabled).toBe(false)
        expect(retrieveGate()).toMatchObject({code: 'SOURCE_UNSUITABLE', section: SOURCES_BUTTON})

        await act(async () => buttonLabelled(LANDSAT_9).click())
        await settled()

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([NEEDS_ATTENTION])
        expect(buttonLabelled('button.apply').disabled).toBe(true)
        const applied = store.getState().process.loadedRecipes[PHENOLOGY].model
        await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
        await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})))
        expect(store.getState().process.loadedRecipes[PHENOLOGY].model).toBe(applied)
    })

    it('says nothing beside it, and can be retrieved, once the Classification stores points', async () => {
        await open({band: 'probability_1', classifier: RANDOM_FOREST, points: false})

        await act(async () => actionBuilder('ADD_POINTS')
            .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], [COLLECTED])
            .dispatch())
        await settled()

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(retrieveGate()).toBe(null)
    })
})

// Applied to each image of the collection, a Classification is applied by the band sets of one input image: one of
// several is valid by itself, and unsuitable for a band it computes alone.
describe('a Phenology over a trainable Classification of two input images', () => {
    it('says beside the classification field that a band it computes needs a Classification of one input image, and holds Retrieve', async () => {
        await open({band: 'probability_1', classifier: RANDOM_FOREST, points: true, inputs: 2})

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([TWO_INPUTS])
        await act(async () => buttonLabelled(LANDSAT_9).click())
        await settled()
        expect(buttonLabelled('button.apply').disabled).toBe(true)
        expect(retrieveGate()).toMatchObject({code: 'SOURCE_UNSUITABLE', section: SOURCES_BUTTON})
    })

    it('says nothing beside it, and can be retrieved, analysing a band of the images', async () => {
        await open({band: 'ndvi', classifier: RANDOM_FOREST, points: true, inputs: 2})
        await act(async () => buttonLabelled(LANDSAT_9).click())
        await settled()
        expect(buttonLabelled('button.apply').disabled).toBe(false)

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(retrieveGate()).toBe(null)
    })
})

describe('a Phenology analysing a band of the images', () => {
    it('says nothing beside the classification field, and can be retrieved, though its Classification stores no points', async () => {
        await open({band: 'ndvi', classifier: RANDOM_FOREST, points: false})
        await act(async () => buttonLabelled(LANDSAT_9).click())
        await settled()
        expect(buttonLabelled('button.apply').disabled).toBe(false)

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(retrieveGate()).toBe(null)
    })
})

describe('a Phenology saved analysing a regression its trainable Classification\'s SVM does not provide', () => {
    it('keeps the saved band, said unsupported beside it, and holds Retrieve', async () => {
        await open({band: 'regression', classifier: C_SVC, points: true})

        expect(errorsOf(BAND_LABEL)).toContainEqual(expect.stringContaining('process.source.classifiedOutputs.band'))
        expect(selectedLabelsOf(BAND_LABEL)).toEqual(['regression'])
        expect(retrieveGate()).toMatchObject({code: 'CONFIGURATION_UNMET', section: SOURCES_BUTTON})
    })
})

const PHENOLOGY = 'phenology-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const SOURCES_BUTTON = 'process.changeAlerts.panel.sources.button'
const CLASSIFICATION_LABEL = 'process.phenology.panel.sources.form.classification.label'
const BAND_LABEL = 'process.phenology.panel.sources.form.band.label'
const NEEDS_ATTENTION = 'process.source.status.recipeNeedsAttention {"recipe":"Classification"}'
const TWO_INPUTS = 'process.source.status.multipleClassifierInputs {"recipe":"Classification","count":2}'
const LANDSAT_9 = 'sources.dataSets.LANDSAT_9.label'
const RANDOM_FOREST = {type: 'RANDOM_FOREST'}
const C_SVC = {type: 'SVM', svmType: 'C_SVC'}
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}

const LISTING = [
    {id: PHENOLOGY, name: 'Phenology', type: 'PHENOLOGY', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Mosaic', type: 'MOSAIC', revision: 1}
]

// Over Landsat 8 scenes, its band as given.
const phenologyRecipe = ({band}) => ({
    id: PHENOLOGY,
    type: 'PHENOLOGY',
    title: 'Phenology',
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {fromYear: 2022, toYear: 2023},
        sources: {dataSetType: 'OPTICAL', classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], cloudPercentageThreshold: 75, band},
        options: {corrections: ['SR']}
    },
    ui: {initialized: true}
})

// A Sentinel-2 mosaic, described from its configuration: a Classification over it observes nothing.
const mosaicRecipe = () => ({
    id: MOSAIC,
    type: 'MOSAIC',
    title: 'Mosaic',
    revision: 1,
    model: {
        dates: {targetDate: '2023-07-01', seasonStart: '2023-01-01', seasonEnd: '2024-01-01', yearsBefore: 0, yearsAfter: 0},
        sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    },
    ui: {initialized: true}
})

const MOSAIC_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}

// Over the mosaic, or twice over it, `inputs` saying how many times.
const classificationRecipe = ({classifier, points, inputs = 1}) => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    title: 'Classification',
    revision: 1,
    model: {
        inputImagery: {images: [MOSAIC_INPUT, {...MOSAIC_INPUT, imageId: 'i-2'}].slice(0, inputs)},
        legend: {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]},
        classifier,
        trainingData: {dataSets: points ? [COLLECTED] : []}
    },
    ui: {initialized: true}
})

// Why Retrieve of the Phenology is held, as far as what its type declares decides it.
const retrieveGate = () => retrieveAvailability({
    state: store.getState(),
    recipe: store.getState().process.loadedRecipes[PHENOLOGY],
    evidenceOwnerOf: id => runtime.evidenceOwnerOf(id),
    heldFor: key => runtime.heldFor(key),
    now: Date.now()
}).gate

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label)?.querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const selectedLabelsOf = label => [...field(label).querySelectorAll('button')]
    .filter(button => button.className.includes('highlight'))
    .map(({textContent}) => textContent)

const buttonLabelled = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open({band, classifier, points, inputs}) {
    const records = [phenologyRecipe({band}), classificationRecipe({classifier, points, inputs}), mosaicRecipe()]
    stored.records = Object.fromEntries(records.map(record => [record.id, record]))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            folders: [],
            tabs: [{id: PHENOLOGY}]
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
                        <Recipe id={PHENOLOGY}>
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
