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

// A PyEO Alerts whose Classification's input changes from optical to radar imagery: the optical monitoring data can no
// longer feed its classifier, so the analysis cannot run, gate or no gate. Only the classification repairs that: Sources
// say it beside the classification, and OPT is not marked - nothing is judged of its gate meanwhile. Over a classification
// the monitoring data feeds, an index its imagery cannot provide is OPT's to repair - another index, or, where it
// provides none the gate offers, no gate - and marks OPT, not Sources. A gate turned off requires nothing. A
// Classification of more than one input image cannot run in PyEO at all, gate or no gate: Sources say so beside it,
// once, whether it was saved so or changed so since, until one input is left. The panel,
// store, source runtime and recipe types are real; the recipe reads answer from stored records, Earth Engine an asset's
// bands at once.

const stored = vi.hoisted(() => ({records: {}}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: ({asset}) => of((ASSET_BANDS[asset] || ['red', 'nir']).map(name => ({name, arrayDimensions: 0}))),
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
const {default: pyeoAlerts} = await import('./pyeoAlerts')
const {default: classification} = await import('../classification/classification')
const {Sources} = await import('./panels/sources/sources')
const {sourceProblemsOfState} = await import('../selectedSourceStatus')

addRecipeType(pyeoAlerts())
addRecipeType(classification())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const UNSUPPLIED = 'process.pyeoAlerts.panel.sources.form.classification.unsuppliedInputs {"missing":"VV, VH"}'
const MULTIPLE_INPUTS = 'process.pyeoAlerts.panel.sources.form.classification.multipleInputs {"count":2}'
const RADAR_ASSET = 'users/x/radar'
const VISIBLE_ASSET = 'users/x/visible'
const OPTICAL_INPUT = {imageId: 'i-1', type: 'ASSET', id: 'users/x/optical', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}
const RADAR_INPUT = {imageId: 'i-1', type: 'ASSET', id: RADAR_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['VV', 'VH']}]}
// Visible bands alone: the monitoring scenes feed its classifier, and no index the gate offers can be computed of it.
const VISIBLE_INPUT = {imageId: 'i-1', type: 'ASSET', id: VISIBLE_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'green', 'blue']}]}
const ASSET_BANDS = {[RADAR_ASSET]: ['VV', 'VH'], [VISIBLE_ASSET]: ['red', 'green', 'blue']}

let root, container, store, runtime

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['turned off', undefined],
    ['on NDVI', {index: 'ndvi', threshold: 0.2}]
])('a PyEO Alerts whose Classification is changed to radar imagery, its index gate %s', (_case, gate) => {
    it('says so beside the classification, marking Sources and not OPT', async () => {
        await open({gate})
        expect(toolbarProblems()).toEqual({})

        await holdInput(RADAR_INPUT)

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([UNSUPPLIED])
        expect(toolbarProblems()).toEqual({sources: UNSUPPLIED})
    })

    it('says nothing once the Classification is over optical imagery again', async () => {
        await open({gate})
        await holdInput(RADAR_INPUT)

        await holdInput(OPTICAL_INPUT)

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(toolbarProblems()).toEqual({})
    })
})

describe('a PyEO Alerts whose Classification is changed to imagery of no index its gate offers, which feeds its classifier', () => {
    it('marks OPT, saying to turn the gate off, and not Sources, while the gate is on', async () => {
        await open({gate: {index: 'ndvi', threshold: 0.2}})

        await holdInput(VISIBLE_INPUT)

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(toolbarProblems()).toEqual({pyeoAlertsOptions: 'process.pyeoAlerts.panel.options.form.gateIndex.noAlternative.BASELINE {"index":"NDVI"}'})
    })

    it('requires nothing of it while the gate is off', async () => {
        await open({gate: undefined})

        await holdInput(VISIBLE_INPUT)

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(toolbarProblems()).toEqual({})
    })
})

describe.each([
    ['turned off', undefined],
    ['on NDVI', {index: 'ndvi', threshold: 0.2}]
])('a PyEO Alerts whose Classification is given a second input image, its index gate %s', (_case, gate) => {
    it('says so beside the classification, alone, marking Sources and not OPT, until the second is removed', async () => {
        await open({gate})

        await holdInput(OPTICAL_INPUT, VISIBLE_INPUT)
        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([MULTIPLE_INPUTS])
        expect(toolbarProblems()).toEqual({sources: MULTIPLE_INPUTS})

        await holdInput(OPTICAL_INPUT)
        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(toolbarProblems()).toEqual({})
    })
})

describe('a PyEO Alerts whose Classification was saved with two input images', () => {
    it('says so beside the classification on opening, saying nothing else of it, though one is radar', async () => {
        await open({gate: {index: 'ndvi', threshold: 0.2}, inputs: [OPTICAL_INPUT, RADAR_INPUT]})

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([MULTIPLE_INPUTS])
        expect(toolbarProblems()).toEqual({sources: MULTIPLE_INPUTS})
    })
})

describe('a Classification of two input images, chosen in Sources', () => {
    it('is refused beside the classification, as the saved one is, holding Apply', async () => {
        await open({gate: undefined})

        await choose(TWO_INPUTS_NAME)

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([MULTIPLE_INPUTS])
        expect(button('button.apply').disabled).toBe(true)
    })
})

describe('a PyEO Alerts gated on an index its Classification\'s imagery cannot provide, though it provides another', () => {
    it('marks OPT, not Sources, until an index it provides is chosen', async () => {
        await open({gate: {index: 'nbr', threshold: 0.2}})

        expect(toolbarProblems()).toEqual({pyeoAlertsOptions: 'process.pyeoAlerts.panel.options.form.gateIndex.unavailable.BASELINE {"index":"NBR"}'})
        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])

        await act(async () => actionBuilder('CHOOSE_INDEX')
            .set(['process.loadedRecipes', PYEO, 'model.pyeoAlertsOptions.indexGate.index'], 'ndvi')
            .dispatch())
        await settled()

        expect(toolbarProblems()).toEqual({})
    })
})

const PYEO = 'pyeo-1'
const CLASSIFICATION = 'classification-1'
const CLASSIFICATION_LABEL = 'process.pyeoAlerts.panel.sources.form.classification.label'
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}

const TWO_INPUTS = 'classification-2'
const TWO_INPUTS_NAME = 'Two inputs'

const LISTING = [
    {id: PYEO, name: 'Alerts', type: 'PYEO_ALERTS', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: TWO_INPUTS, name: TWO_INPUTS_NAME, type: 'CLASSIFICATION', revision: 1}
]

const pyeoRecipe = gate => ({
    id: PYEO,
    type: 'PYEO_ALERTS',
    title: 'Alerts',
    revision: 1,
    model: {
        dates: {monitoringStart: '2024-01-01', monitoringEnd: '2024-06-01'},
        sources: {classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75, changeFromClasses: [1], changeToClasses: [2]},
        options: {corrections: ['SR']},
        pyeoAlertsOptions: {minConsecutiveDetections: 2, ...(gate && {indexGate: gate})}
    },
    ui: {initialized: true}
})

// Over the given input images, by default the optical one alone.
const classificationRecipe = (inputs = [OPTICAL_INPUT], id = CLASSIFICATION) => ({
    id,
    type: 'CLASSIFICATION',
    title: 'Classification',
    revision: 1,
    model: {
        inputImagery: {images: imagesOf(inputs)},
        legend: {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets: [COLLECTED]}
    },
    ui: {initialized: true}
})

// What the toolbar buttons say, by section.
const toolbarProblems = () =>
    sourceProblemsOfState(store.getState(), PYEO, id => runtime.evidenceOwnerOf(id), Date.now(), key => runtime.heldFor(key))

const imagesOf = inputs => inputs.map((input, i) => ({...input, imageId: `i-${i + 1}`}))

// The Classification's input imagery, as the session holds it.
const holdInput = async (...inputs) => {
    await act(async () => actionBuilder('EDIT_INPUT')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.inputImagery.images'], imagesOf(inputs))
        .dispatch())
    await settled()
}

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

// The classification chosen by its name in Sources' selector.
const choose = async name => {
    await act(async () => field(CLASSIFICATION_LABEL).querySelector('input').click())
    const option = [...document.querySelectorAll('li')].map(item => item.firstElementChild).find(item => item?.textContent === name)
    expect(option, `no option for ${name}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label).querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open({gate, inputs}) {
    const records = [pyeoRecipe(gate), classificationRecipe(inputs), classificationRecipe([OPTICAL_INPUT, VISIBLE_INPUT], TWO_INPUTS)]
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
            tabs: [{id: PYEO}]
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
                        <Recipe id={PYEO}>
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
