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

// The Classification a CCDC's Sources select is part of its analysis, whatever its breakpoint bands (type/ccdc.js):
// where it cannot be trained - it stores no training points - the Sources panel names it beside the classification
// field, whose own sections say why, and Retrieve is held, without holding the panel's Apply - for a breakpoint band it
// computes, which trains it, and for breakpoint bands of the images alike. The panel, store, source runtime and recipe types are real; the recipe reads answer from stored
// records, Earth Engine the bands of a recipe's image at once.

const stored = vi.hoisted(() => ({records: {}}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: ({recipe}) => of(recipe?.type === 'CCDC'
            ? ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']
            : ['red', 'nir'].map(name => ({name, arrayDimensions: 0}))),
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
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
// The Sources panel is open.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc')
const {default: classification} = await import('../classification/classification')
const {default: opticalMosaic} = await import('../opticalMosaic/opticalMosaic')
const {Sources} = await import('./panels/sources/sources')
const {retrieveAvailability} = await import('../operationAvailability')

addRecipeType(ccdc())
addRecipeType(classification())
addRecipeType(opticalMosaic())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['a breakpoint band its Classification computes', ['ndvi', 'probability_1']],
    ['breakpoint bands of the images alone', ['ndvi']]
])('a CCDC fitting %s, by whether its Classification stores training points', (_case, breakpointBands) => {
    it('names the Classification beside the classification field, and holds Retrieve, while it cannot be trained', async () => {
        await open({breakpointBands, classifier: RANDOM_FOREST, points: false})

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([NEEDS_ATTENTION])
        expect(retrieveGate()).toMatchObject({code: 'SOURCE_UNSUITABLE', section: SOURCES_BUTTON})

        await act(async () => buttonLabelled(LANDSAT_7).click())
        await settled()

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([NEEDS_ATTENTION])
        expect(buttonLabelled('button.apply').disabled).toBe(false)
    })

    it('says nothing beside it, and can be retrieved, once the Classification stores points', async () => {
        await open({breakpointBands, classifier: RANDOM_FOREST, points: false})

        await act(async () => actionBuilder('ADD_POINTS')
            .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], [COLLECTED])
            .dispatch())
        await settled()

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(retrieveGate()).toBe(null)
    })
})

// Selecting none needs nothing of any.
describe('a CCDC selecting no Classification', () => {
    it('says nothing beside the classification field, and can be retrieved', async () => {
        await open({breakpointBands: ['ndvi'], classifier: RANDOM_FOREST, points: false, classification: null})

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(retrieveGate()).toBe(null)
    })
})

describe('a CCDC saved fitting a regression its trainable Classification\'s SVM does not provide', () => {
    it('keeps the saved breakpoint band, said unsupported beside it, and holds Retrieve', async () => {
        await open({breakpointBands: ['ndvi', 'regression'], classifier: C_SVC, points: true})

        expect(errorsOf(BREAKPOINT_BANDS_LABEL)).toContainEqual(expect.stringContaining('process.source.classifiedOutputs.breakpointBands'))
        expect(selectedLabelsOf(BREAKPOINT_BANDS_LABEL)).toContain('regression')
        expect(retrieveGate()).toMatchObject({code: 'CONFIGURATION_UNMET', section: SOURCES_BUTTON})
    })
})

const CCDC = 'ccdc-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const SOURCES_BUTTON = 'process.ccdc.panel.sources.button'
const CLASSIFICATION_LABEL = 'process.ccdc.panel.sources.form.classification.label'
const BREAKPOINT_BANDS_LABEL = 'process.ccdc.panel.sources.form.breakpointBands.label'
const NEEDS_ATTENTION = 'process.source.status.recipeNeedsAttention {"recipe":"Classification"}'
const LANDSAT_7 = 'sources.dataSets.LANDSAT_7.label'
const RANDOM_FOREST = {type: 'RANDOM_FOREST'}
const C_SVC = {type: 'SVM', svmType: 'C_SVC'}
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}

const LISTING = [
    {id: CCDC, name: 'CCDC', type: 'CCDC', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Mosaic', type: 'MOSAIC', revision: 1}
]

// Over Landsat 8 scenes, its breakpoint bands as given.
// `classification` null: its Sources select none.
const ccdcRecipe = ({breakpointBands, classification = CLASSIFICATION}) => ({
    id: CCDC,
    type: 'CCDC',
    title: 'CCDC',
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSetType: 'OPTICAL', classification, dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], cloudPercentageThreshold: 75, breakpointBands},
        options: {corrections: ['SR']},
        opticalPreprocess: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1}
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

const classificationRecipe = ({classifier, points}) => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    title: 'Classification',
    revision: 1,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend: {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]},
        classifier,
        trainingData: {dataSets: points ? [COLLECTED] : []}
    },
    ui: {initialized: true}
})

// Why Retrieve of the CCDC is held, as far as what its type declares decides it.
const retrieveGate = () => retrieveAvailability({
    state: store.getState(),
    recipe: store.getState().process.loadedRecipes[CCDC],
    evidenceOwnerOf: id => runtime.evidenceOwnerOf(id),
    heldFor: key => runtime.heldFor(key),
    now: Date.now()
}).gate

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them. The classification field shows in
// the panel's simple view only while there is something to say of it.
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

async function open({breakpointBands, classifier, points, classification}) {
    const records = [ccdcRecipe({breakpointBands, classification}), classificationRecipe({classifier, points}), mosaicRecipe()]
    stored.records = Object.fromEntries(records.map(record => [record.id, record]))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
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
