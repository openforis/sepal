import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject, throwError} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import widgetStyles from '~/widget/widget.module.css'

// OPT's index gate reads the Classification selected under Sources, as PyEO's shared definition judges it
// (lib/js/shared/src/recipe/type/pyeoAlerts.js). While that classification has more than one input image, or the
// monitoring data cannot feed its classifier - said in Sources, not again here - or while it is still being read, or
// cannot be, which is said here, the gate's settings stay shown as they are, disabled, and nothing is said against its
// index; the other detection rules stay editable. Over a classification the
// monitoring data feeds, an index its imagery cannot provide is said beside the index, repaired by another index or by
// turning the gate off. The indexes offered follow the same rule over the evidence held now: changing only the
// Classification changes them. Opening OPT edits nothing. The panel, form, store, source runtime and recipe types are
// real; storage answers the classification as a test says, Earth Engine an asset's bands at once.
// Detection thresholds keep the upstream defaults, persistence and From/To controls behind More unless set.

const stored = vi.hoisted(() => ({classification: null}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: ({asset}) => of(ASSET_BANDS[asset].map(name => ({name, arrayDimensions: 0}))),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {load$: () => stored.classification, loadAll$: () => of(LISTING), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => {
    const text = [key].flat().join('.')
    return values ? `${text} ${JSON.stringify(values)}` : text
}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: pyeoAlerts} = await import('../../pyeoAlerts')
const {default: classification} = await import('../../../classification/classification')
const {Options} = await import('./options')

addRecipeType(pyeoAlerts())
addRecipeType(classification())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('OPT over a Classification the monitoring data cannot feed', () => {
    it('keeps the gate, its index and threshold shown as saved, disabled, without saying again what Sources says', async () => {
        await open({input: RADAR_INPUT, gate: {index: 'nbr', threshold: 0.3}})

        expect(shown()).not.toContain(DEPENDS_ON_SOURCES)
        expect(gateControls()).toEqual({useIndexGate: DISABLED, gateIndex: DISABLED, gateThreshold: DISABLED})
        expect(selectedGateIndex()).toBe('NBR')
        expect(errorsOf(INDEX_LABEL)).toEqual([])
        expect(applyOffered()).toBe(false)
    })

    it('leaves the other detection rules editable', async () => {
        await open({input: RADAR_INPUT, gate: {index: 'nbr', threshold: 0.3}})

        expect(isDisabled(CUMULATIVE_LABEL)).toBe(false)
    })

    it('restores the gate\'s settings, as they were, once the classification is repaired', async () => {
        await open({input: RADAR_INPUT, gate: {index: 'nbr', threshold: 0.3}})

        await holdInput(OPTICAL_INPUT)

        expect(shown()).not.toContain(DEPENDS_ON_SOURCES)
        expect(gateControls()).toEqual({useIndexGate: ENABLED, gateIndex: ENABLED, gateThreshold: ENABLED})
        expect(selectedGateIndex()).toBe('NBR')
        expect(errorsOf(INDEX_LABEL)).toEqual([])
        expect(savedOptions().indexGate).toEqual({index: 'nbr', threshold: 0.3})
    })
})

describe('OPT over a Classification of more than one input image', () => {
    it('keeps the gate shown as saved, disabled, with nothing said against its index, until one input is left', async () => {
        await open({input: [OPTICAL_INPUT, RED_NIR_INPUT], gate: {index: 'nbr', threshold: 0.3}})

        expect(gateControls()).toEqual({useIndexGate: DISABLED, gateIndex: DISABLED, gateThreshold: DISABLED})
        expect(selectedGateIndex()).toBe('NBR')
        expect(errorsOf(INDEX_LABEL)).toEqual([])
        expect(shown()).not.toContain(DEPENDS_ON_SOURCES)
        expect(isDisabled(CUMULATIVE_LABEL)).toBe(false)

        await holdInput(OPTICAL_INPUT)

        expect(gateControls()).toEqual({useIndexGate: ENABLED, gateIndex: ENABLED, gateThreshold: ENABLED})
        expect(selectedGateIndex()).toBe('NBR')
        expect(errorsOf(INDEX_LABEL)).toEqual([])
    })
})

describe('OPT while the Classification is being read', () => {
    it('keeps the gate disabled, saying the classification is being checked, until it is read', async () => {
        const answer = new Subject()
        await open({input: OPTICAL_INPUT, gate: {index: 'nbr', threshold: 0.3}, classification: answer})

        expect(shown()).toContain(dependsOnSources('CHECKING'))
        expect(gateControls()).toEqual({useIndexGate: DISABLED, gateIndex: DISABLED, gateThreshold: DISABLED})

        await act(async () => {
            answer.next(classificationRecipe(OPTICAL_INPUT))
            answer.complete()
        })
        await settled()

        expect(shown()).not.toContain(DEPENDS_ON_SOURCES)
        expect(gateControls()).toEqual({useIndexGate: ENABLED, gateIndex: ENABLED, gateThreshold: ENABLED})
        expect(selectedGateIndex()).toBe('NBR')
    })
})

describe('OPT while the Classification cannot be read', () => {
    it('keeps the gate disabled, saying the classification cannot be checked', async () => {
        await open({input: OPTICAL_INPUT, gate: {index: 'nbr', threshold: 0.3}, classification: throwError(() => ({status: 500}))})

        expect(shown()).toContain(dependsOnSources('UNAVAILABLE'))
        expect(gateControls()).toEqual({useIndexGate: DISABLED, gateIndex: DISABLED, gateThreshold: DISABLED})
    })
})

describe('OPT over a Classification the monitoring data feeds', () => {
    it('says nothing, offering no Apply, over imagery providing the saved index', async () => {
        await open({input: OPTICAL_INPUT, gate: {index: 'nbr', threshold: 0.3}})

        expect(shown()).not.toContain(DEPENDS_ON_SOURCES)
        expect(errorsOf(INDEX_LABEL)).toEqual([])
        expect(applyOffered()).toBe(false)
    })

    it('says beside the index that the imagery cannot provide it, and is repaired by one it can, which Apply saves', async () => {
        await open({input: RED_NIR_INPUT, gate: {index: 'nbr', threshold: 0.3}})
        expect(errorsOf(INDEX_LABEL)).toEqual([`${UNAVAILABLE_INDEX} {"index":"NBR"}`])
        expect(selectedGateIndex()).toBe('NBR')

        await chooseGateIndex('NDVI')

        expect(errorsOf(INDEX_LABEL)).toEqual([])
        await press('button.apply')
        expect(savedOptions().indexGate).toEqual({index: 'ndvi', threshold: 0.3})
    })

    it('says, where the imagery provides no index the gate offers, to turn the gate off, which Apply saves', async () => {
        await open({input: VISIBLE_INPUT, gate: {index: 'ndvi', threshold: 0.2}})
        expect(errorsOf(INDEX_LABEL)).toEqual([`${NO_ALTERNATIVE} {"index":"NDVI"}`])
        expect(shown()).not.toContain(DEPENDS_ON_SOURCES)

        await press(GATE_OFF)

        expect(errorsOf(INDEX_LABEL)).toEqual([])
        await press('button.apply')
        expect(savedOptions().indexGate).toBeUndefined()
    })

    it('leaves the gate as saved when that repair is cancelled', async () => {
        await open({input: VISIBLE_INPUT, gate: {index: 'ndvi', threshold: 0.2}})

        await press(GATE_OFF)
        await press('button.cancel')

        expect(savedOptions().indexGate).toEqual({index: 'ndvi', threshold: 0.2})
    })

    it('cannot have the gate turned on over imagery providing no index it offers', async () => {
        await open({input: VISIBLE_INPUT, gate: undefined})

        expect(gateButton(GATE_ON).disabled).toBe(true)
        expect(errorsOf(INDEX_LABEL)).toEqual([])
    })
})

// Only the Classification's input changes, in the session, as an edit in its own tab does.
describe('OPT over a Classification whose imagery is changed', () => {
    it('can have the gate turned on once the imagery provides an index it offers', async () => {
        await open({input: VISIBLE_INPUT, gate: undefined})
        expect(gateButton(GATE_ON).disabled).toBe(true)

        await holdInput(RED_NIR_INPUT)

        expect(gateButton(GATE_ON).disabled).toBe(false)
        await press(GATE_ON)
        await press('button.apply')
        expect(savedOptions().indexGate.index).toBe('ndvi')
    })

    it('offers, as a repair, an index the new imagery provides', async () => {
        await open({input: RED_NIR_INPUT, gate: {index: 'ndvi', threshold: 0.2}})

        await holdInput(NIR_SWIR_INPUT)

        expect(errorsOf(INDEX_LABEL)).toEqual([`${UNAVAILABLE_INDEX} {"index":"NDVI"}`])
        await chooseGateIndex('NBR')
        expect(errorsOf(INDEX_LABEL)).toEqual([])
        await press('button.apply')
        expect(savedOptions().indexGate).toEqual({index: 'nbr', threshold: 0.2})
    })
})

// Asset -> Stack -> Classification -> PyEO: the index is calculated of the spectral bands the Stack outputs, by the names
// its mapping gives them, whichever of them the Classification trains on - red alone here. Only the Stack changes.
describe('OPT over a Classification of a Stack of an optical asset', () => {
    it('offers Require drop on NDVI where the Stack outputs red and nir, providing no ndvi band', async () => {
        await open({input: STACK_INPUT, stack: ['red', 'nir'], gate: undefined})

        expect(gateButton(GATE_ON).disabled).toBe(false)
        await press(GATE_ON)
        expect(errorsOf(INDEX_LABEL)).toEqual([])
        await press('button.apply')
        expect(savedOptions().indexGate.index).toBe('ndvi')
    })

    it('offers NBR where the Stack outputs nir and swir2', async () => {
        await open({input: STACK_INPUT, stack: ['red', 'nir', 'swir2'], gate: {index: 'ndvi', threshold: 0.2}})

        await chooseGateIndex('NBR')

        expect(errorsOf(INDEX_LABEL)).toEqual([])
    })

    it('says to turn Require drop off once nir is removed from the Stack, and recovers, its choices kept, once restored', async () => {
        await open({input: STACK_INPUT, stack: ['red', 'nir'], gate: {index: 'ndvi', threshold: 0.3}})
        expect(errorsOf(INDEX_LABEL)).toEqual([])

        await holdStack(['red'])
        expect(errorsOf(INDEX_LABEL)).toEqual([`${NO_ALTERNATIVE} {"index":"NDVI"}`])

        await holdStack(['red', 'nir'])
        expect(errorsOf(INDEX_LABEL)).toEqual([])
        expect(selectedGateIndex()).toBe('NDVI')
        expect(gateControls()).toEqual({useIndexGate: ENABLED, gateIndex: ENABLED, gateThreshold: ENABLED})
    })

    it('cannot have Require drop turned on where the Stack outputs nir under another name', async () => {
        await open({input: STACK_INPUT, stack: ['red', 'nir'], renamed: {nir: 'b8'}, gate: undefined})

        expect(gateButton(GATE_ON).disabled).toBe(true)
    })
})

describe('a gate turned on with no index saved', () => {
    it('takes NDVI where the imagery provides it', async () => {
        await open({input: OPTICAL_INPUT, gate: undefined})

        await press(GATE_ON)
        await press('button.apply')

        expect(savedOptions().indexGate.index).toBe('ndvi')
    })

    it('takes an index the imagery provides where NDVI is not', async () => {
        await open({input: NIR_SWIR_INPUT, gate: undefined})

        await press(GATE_ON)
        await press('button.apply')

        expect(savedOptions().indexGate.index).toBe('nbr')
    })
})

describe('the minimum drop', () => {
    it('stays in place, disabled, while no drop is required', async () => {
        await open({input: OPTICAL_INPUT, gate: undefined})

        expect(field(THRESHOLD_LABEL)).not.toBeNull()
        expect(field(THRESHOLD_LABEL).className).toMatch(/disabled/)

        await press('process.pyeoAlerts.panel.options.form.useIndexGate.on')

        expect(field(THRESHOLD_LABEL).className).not.toMatch(/disabled/)
    })
})

describe('detection thresholds', () => {
    it('offer UoL\'s defaults to a recipe with none saved', async () => {
        await open({input: OPTICAL_INPUT, options: {}})

        await press('button.more')

        expect(shownThresholds()).toEqual({minRepeatability: 50, minCumulativeDetections: 2, minFromDetections: 2, minToDetections: 2})
    })

    it('keep the From/To detections behind More while both hold the default', async () => {
        await open({input: OPTICAL_INPUT, options: {minFromDetections: 2, minToDetections: 2}})

        expect(shownThresholds()).not.toHaveProperty('minFromDetections')
        expect(shownThresholds()).not.toHaveProperty('minToDetections')
    })

    it('show the From/To detections at once when one is set', async () => {
        await open({input: OPTICAL_INPUT, options: {minFromDetections: 3}})

        expect(shownThresholds()).toMatchObject({minFromDetections: 3, minToDetections: 2})
    })

    it('are kept when another option is applied', async () => {
        const thresholds = {minRepeatability: 70, minCumulativeDetections: 3, minFromDetections: 1, minToDetections: 4}
        await open({input: OPTICAL_INPUT, options: thresholds})

        await press('process.pyeoAlerts.panel.options.form.useIndexGate.on')
        await press('button.apply')

        expect(savedOptions()).toMatchObject(thresholds)
    })

    it('save the cumulative detections of a recipe saved as minConsecutiveDetections under the new name', async () => {
        await open({input: OPTICAL_INPUT, options: {minConsecutiveDetections: 4}})
        expect(shownThresholds().minCumulativeDetections).toBe(4)

        await press('process.pyeoAlerts.panel.options.form.useIndexGate.on')
        await press('button.apply')

        expect(savedOptions().minCumulativeDetections).toBe(4)
        expect(savedOptions()).not.toHaveProperty('minConsecutiveDetections')
    })
})

describe('detection thresholds through an upstream repair', () => {
    it('keeps the thresholds editable and preserves them when Require drop becomes usable again', async () => {
        const thresholds = {minRepeatability: 70, minCumulativeDetections: 3, minFromDetections: 1, minToDetections: 4}
        await open({input: RADAR_INPUT, gate: {index: 'nbr', threshold: 0.3}, options: thresholds})

        expect(gateControls()).toEqual({useIndexGate: DISABLED, gateIndex: DISABLED, gateThreshold: DISABLED})
        expect(shownThresholds()).toEqual(thresholds)
        for (const name of Object.keys(thresholds)) {
            expect(isDisabled(`process.pyeoAlerts.panel.options.form.${name}.label`)).toBe(false)
        }

        await holdInput(OPTICAL_INPUT)
        expect(gateControls()).toEqual({useIndexGate: ENABLED, gateIndex: ENABLED, gateThreshold: ENABLED})
        await press(GATE_OFF)
        await press('button.apply')

        expect(savedOptions()).toMatchObject(thresholds)
        expect(savedOptions().indexGate).toBeUndefined()
    })
})

const PYEO = 'pyeo-1'
const CLASSIFICATION = 'classification-1'
const INDEX_LABEL = 'process.pyeoAlerts.panel.options.form.gateIndex.label'
const GATE_LABEL = 'process.pyeoAlerts.panel.options.form.useIndexGate.label'
const THRESHOLD_LABEL = 'process.pyeoAlerts.panel.options.form.gateThreshold.label'
const CUMULATIVE_LABEL = 'process.pyeoAlerts.panel.options.form.minCumulativeDetections.label'
const GATE_ON = 'process.pyeoAlerts.panel.options.form.useIndexGate.on'
const GATE_OFF = 'process.pyeoAlerts.panel.options.form.useIndexGate.off'
const DEPENDS_ON_SOURCES = 'process.pyeoAlerts.panel.options.form.useIndexGate.dependsOnSources'
const UNAVAILABLE_INDEX = 'process.pyeoAlerts.panel.options.form.gateIndex.unavailable.BASELINE'
const NO_ALTERNATIVE = 'process.pyeoAlerts.panel.options.form.gateIndex.noAlternative.BASELINE'
const ENABLED = 'enabled'
const DISABLED = 'disabled'

const dependsOnSources = state => `${DEPENDS_ON_SOURCES}.${state}`

const assetInput = (id, included) =>
    ({imageId: 'i-1', type: 'ASSET', id, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included}]})

// Every index the gate offers can be calculated of the optical input; NDVI alone of red and NIR; NBR alone of NIR and
// SWIR2; none of radar or visible bands. The monitoring data - Landsat - feeds a classifier over any of them but radar.
const OPTICAL_INPUT = assetInput('users/x/optical', ['red', 'nir', 'swir1', 'swir2'])
const RED_NIR_INPUT = assetInput('users/x/red-nir', ['red', 'nir'])
const NIR_SWIR_INPUT = assetInput('users/x/nir-swir', ['nir', 'swir2'])
const VISIBLE_INPUT = assetInput('users/x/visible', ['red', 'green', 'blue'])
const RADAR_INPUT = assetInput('users/x/radar', ['VV', 'VH'])

const ASSET_BANDS = Object.fromEntries([OPTICAL_INPUT, RED_NIR_INPUT, NIR_SWIR_INPUT, VISIBLE_INPUT, RADAR_INPUT]
    .map(({id, bandSetSpecs: [{included}]}) => [id, included]))

const STACK = 'stack-1'

const LISTING = [
    {id: PYEO, name: 'Alerts', type: 'PYEO_ALERTS', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: STACK, name: 'Stack', type: 'STACK', revision: 1}
]

// The Classification's input: the Stack, its classifier trained on red alone.
const STACK_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: STACK, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red']}]}

// A Stack of the optical asset, mapping its `bands` to outputs of the same names unless `renamed` maps one to another.
const stackRecipe = (bands, renamed = {}) => ({
    id: STACK,
    type: 'STACK',
    title: 'Stack',
    revision: 1,
    model: {
        inputImagery: {images: [{imageId: 's-1', type: 'ASSET', id: OPTICAL_INPUT.id}]},
        bandNames: {bandNames: [{imageId: 's-1', bands: bands.map(band => ({originalName: band, outputName: renamed[band] || band}))}]}
    },
    ui: {initialized: true}
})

// The Stack's mapping, as the session holds it after an edit in its own tab.
const holdStack = async bands => {
    await act(async () => actionBuilder('EDIT_STACK')
        .set(['process.loadedRecipes', STACK, 'model.bandNames'], stackRecipe(bands).model.bandNames)
        .dispatch())
    await settled()
}

const pyeoRecipe = ({gate, options = {minCumulativeDetections: 2}}) => ({
    id: PYEO,
    type: 'PYEO_ALERTS',
    title: 'Alerts',
    revision: 1,
    model: {
        dates: {monitoringStart: '2024-01-01', monitoringEnd: '2024-06-01'},
        sources: {classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75, changeFromClasses: [1], changeToClasses: [2]},
        options: {corrections: ['SR']},
        pyeoAlertsOptions: {...options, ...(gate && {indexGate: gate})}
    },
    ui: {initialized: true}
})

// Over `input`, or each of several.
const classificationRecipe = input => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    title: 'Classification',
    revision: 1,
    model: {
        inputImagery: {images: [input].flat().map((image, i) => ({...image, imageId: `i-${i + 1}`}))},
        legend: {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]}
    },
    ui: {initialized: true}
})

const savedOptions = () => store.getState().process.loadedRecipes[PYEO].model.pyeoAlertsOptions

// The classification's input imagery, as the session holds it.
const holdInput = async input => {
    await act(async () => actionBuilder('EDIT_INPUT')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.inputImagery.images'], classificationRecipe(input).model.inputImagery.images)
        .dispatch())
    await settled()
}

const shown = () => document.body.textContent

const buttons = () => [...document.querySelectorAll('button')]

const gateButton = label => buttons().find(button => button.textContent === label)

const press = async label => {
    const button = gateButton(label)
    expect(button, `no button ${label}`).toBeDefined()
    await act(async () => button.click())
    await settled()
}

// An unedited panel offers Close rather than Apply.
const applyOffered = () => !!gateButton('button.apply')

const field = label => document.querySelector(`[data-label="${label}"]`)

const isDisabled = label => field(label).classList.contains(widgetStyles.disabled)

const gateControls = () => ({
    useIndexGate: isDisabled(GATE_LABEL) ? DISABLED : ENABLED,
    gateIndex: isDisabled(INDEX_LABEL) ? DISABLED : ENABLED,
    gateThreshold: isDisabled(THRESHOLD_LABEL) ? DISABLED : ENABLED
})

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label).querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const selectedGateIndex = () => {
    const input = field(INDEX_LABEL).querySelector('input')
    return input.value || input.placeholder
}

const THRESHOLD_VALUE = /^process\.pyeoAlerts\.panel\.options\.form\.(minRepeatability|minCumulativeDetections|minFromDetections|minToDetections)\.value (\{.*\})$/

// The thresholds the panel shows, by name, as their sliders say their values.
const shownThresholds = () => Object.fromEntries(
    texts()
        .map(text => text.match(THRESHOLD_VALUE))
        .filter(Boolean)
        .map(([, name, values]) => [name, JSON.parse(values).value])
)

const texts = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const found = []
    while (walker.nextNode()) {
        found.push(walker.currentNode.textContent)
    }
    return found
}

const chooseGateIndex = async label => {
    await act(async () => field(INDEX_LABEL).querySelector('input').click())
    await settled()
    const option = [...document.querySelectorAll('[data-hook="option"]')].find(option => option.textContent === label)
    expect(option, `no option ${label}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

// `classification`: what storage answers for the classification, which the session then does not hold - by default,
// the session holds it over `input`.
// `stack`: the bands a Stack the Classification's input names maps, `renamed` as stackRecipe takes it.
async function open({input, gate, classification, stack, renamed, options}) {
    stored.classification = classification
    const held = [
        ...classification ? [] : [classificationRecipe(input)],
        ...stack ? [stackRecipe(stack, renamed)] : []
    ]
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries([pyeoRecipe({gate, options}), ...held].map(record => [record.id, record])),
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
                <EventShield>
                    <PortalContainer/>
                    <PortalContainer id='panels'/>
                    <PortalContext id='panels'>
                        <Recipe id={PYEO}>
                            <Options/>
                        </Recipe>
                    </PortalContext>
                </EventShield>
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
