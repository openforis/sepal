import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// A Regression predicting above-ground biomass from a Landsat composite, and a Remapping of its predictions, through
// Regression's real Training data button, data set list and editor, its layer and Retrieve, over the real store, source
// runtime and recipe types. Regression trains whichever classifier it is configured with, so one whose data sets store
// no point - and read none from another recipe - cannot run: its Training data section says so, nothing is drawn, and
// Retrieve is held, for it and for the Remapping alike. A data set reloaded in its editor changes nothing until it is
// applied; cancelled, it never does. Earth Engine is faked: the plots table answers its rows when a test says so.

const fake = vi.hoisted(() => ({rows: []}))
vi.mock('~/apiRegistry', async () => {
    const {NEVER, of, Subject} = await import('rxjs')
    return {default: {
        recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of(LISTING)},
        gee: {
            loadEETableColumns$: () => of(['agb', 'plot_id']),
            // The table's rows, answered when a test answers.
            loadEETableRows$: () => {
                const rows$ = new Subject()
                fake.rows.push(rows$)
                return rows$
            },
            assetMetadata$: ({asset}) => of({type: 'Table', id: asset, properties: {}}),
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'TABLE', version: 'v1'}))}),
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
        }
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => {
    const name = Array.isArray(key) ? key.join('.') : key
    return values ? `${name} ${JSON.stringify(values)}` : name
}}))
vi.mock('~/user', () => ({isServiceAccount: () => false}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
// The data set list is open; a data set's editor opens for the data set chosen in it, until it closes.
const editor = vi.hoisted(() => ({open: () => {}}))
vi.mock('~/widget/activation/activatable', async () => {
    const {useEffect, useState} = await import('react')
    return {
        withActivatable: ({id}) => Component => props => {
            const [dataSetId, setDataSetId] = useState(null)
            useEffect(() => {
                if (id === 'trainingDataSet') {
                    editor.open = setDataSetId
                }
            }, [])
            if (id === 'trainingDataSet') {
                return dataSetId
                    ? <Component {...props} activatable={{active: true, dataSetId, activate: () => {}, deactivate: () => setDataSetId(null)}}/>
                    : null
            }
            return <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
        }
    }
})
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props =>
        <Component {...props} activator={{activatables: {
            trainingDataSet: {activate: ({dataSetId}) => editor.open(dataSetId)},
            button: {active: false, canActivate: true, toggle: () => {}}
        }}}/>
}))
// What a layer is given to draw is what the map mounts, requesting a preview.
const map = vi.hoisted(() => ({shown: undefined}))
vi.mock('~/app/home/map/mapAreaLayout', () => ({
    MapAreaLayout: ({layer}) => {
        map.shown = layer
        return null
    }
}))
vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({
    EarthEngineImageLayer: class {
        constructor({watchedProps}) {
            this.watchedProps = watchedProps
        }
        removeFromMap() {}
    }
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: regression} = await import('./regression')
const {default: remapping} = await import('../remapping/remapping')
const {RegressionImageLayer} = await import('./regressionImageLayer')
const {getPreSetVisualizations} = await import('./visualizations')
const {addRecipeImageLayer} = await import('../../recipeImageLayerRegistry')
const {Recipe} = await import('~/app/home/body/process/recipeContext')
const {SourceRuntimeProvider, withSourceRuntime} = await import('~/app/home/body/process/sourceRuntime/sourceRuntimeContext')
const {TrainingData} = await import('./panels/trainingData/trainingData')
const {SectionButton} = await import('../sectionButton')
const {RecipeImageLayer} = await import('../recipeImageLayer')
const {retrieveAvailability} = await import('../operationAvailability')
const {readRetrieveOutput} = await import('../retrieveOutput')
const {requestGate} = await import('../sourceRequirements')
const {sourceProblemsOfState} = await import('../selectedSourceStatus')
const {TabContext} = await import('~/widget/tabs/tabContext')
const {MapAreaContext} = await import('~/app/home/map/mapAreaContext')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {Toolbar} = await import('~/widget/toolbar/toolbar')

addRecipeType(regression())
addRecipeType(remapping())
addRecipeImageLayer('REGRESSION', RegressionImageLayer)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

beforeEach(() => {
    fake.rows = []
    map.shown = undefined
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a Regression without training data', () => {
    it.each([
        ['no data set', () => []],
        ['a plots table read as empty', () => [plotsTable([])]]
    ])('with %s is marked on Training data, drawing nothing and holding Retrieve, and so is a Remapping of it', async (_case, dataSetsOf) => {
        await open(dataSetsOf())

        expect(trainingDataMark()).toEqual([MISSING])
        expect(sectionProblems(REGRESSION)).toEqual({trainingData: MISSING})
        expect(map.shown).toBeNull()
        expect(retrieveAvailable(REGRESSION)).toBe(false)
        expect(previewGate(REMAPPING)).toMatchObject({withdraw: true})
        expect(retrieveAvailable(REMAPPING)).toBe(false)
        expect(retrieveRead(REMAPPING).output.readiness.findings).toEqual([
            expect.objectContaining({code: 'NO_TRAINING_DATA', recipePath: [REMAPPING, REGRESSION]})
        ])
        expect(sectionProblems(REMAPPING)).toEqual({
            inputImagery: 'process.source.status.recipeNeedsAttention {"recipe":"Biomass"}'
        })
    })
})

describe('a Regression with training data', () => {
    it.each([
        ['plots stored from a table', () => [plotsTable(PLOTS)]],
        ['plots read from another Regression when it runs, which are not known here', () => [TRAINED_ELSEWHERE_DATA_SET]]
    ])('with %s is marked nowhere, drawn, and Retrieve is available, for it and a Remapping of it', async (_case, dataSetsOf) => {
        await open(dataSetsOf())

        expect(trainingDataMark()).toEqual([])
        expect(map.shown).toBeTruthy()
        expect(retrieveAvailable(REGRESSION)).toBe(true)
        expect(previewGate(REMAPPING)).toBeNull()
        expect(retrieveAvailable(REMAPPING)).toBe(true)
    })
})

describe('a plots table read as empty, reloaded in its editor', () => {
    it('changes nothing applied while its rows are only in the editor, nor once it is cancelled', async () => {
        await open([plotsTable([])])

        await editDataSet('biomass_plots')
        await answerRows(PLOTS)
        expect(applyEnabled()).toBe(true)
        expect(trainingDataMark()).toEqual([MISSING])
        expect(retrieveAvailable(REGRESSION)).toBe(false)
        await click(button('button.cancel'))

        expect(savedDataSets()).toEqual([plotsTable([])])
        expect(trainingDataMark()).toEqual([MISSING])
        expect(map.shown).toBeNull()
        expect(retrieveAvailable(REGRESSION)).toBe(false)
        expect(retrieveAvailable(REMAPPING)).toBe(false)
    })

    it('once applied with its rows, restores the Regression and the Remapping of it', async () => {
        await open([plotsTable([])])

        await editDataSet('biomass_plots')
        await answerRows(PLOTS)
        await click(button('button.apply'))

        expect(savedDataSets()[0].referenceData).toEqual(PLOTS)
        expect(trainingDataMark()).toEqual([])
        expect(map.shown).toBeTruthy()
        expect(retrieveAvailable(REGRESSION)).toBe(true)
        expect(previewGate(REMAPPING)).toBeNull()
        expect(retrieveAvailable(REMAPPING)).toBe(true)
    })
})

const REGRESSION = 'regression-1'
const REMAPPING = 'remapping-1'
const COMPOSITE = 'composite-1'
const PLOTS_TABLE = 'users/x/biomass_plots'
const MISSING = 'process.classification.panel.trainingData.missing'

const LISTING = [
    {id: REGRESSION, name: 'Biomass', type: 'REGRESSION', revision: 1},
    {id: REMAPPING, name: 'High biomass', type: 'REMAPPING', revision: 1},
    {id: COMPOSITE, name: 'Landsat composite', type: 'MOSAIC', revision: 1},
    {id: 'regression-0', name: 'Earlier biomass', type: 'REGRESSION', revision: 1}
]

// Above-ground biomass in tonnes per hectare, measured on field plots, as the plots table's rows are read into points.
const PLOTS = [{x: 9.71, y: 4.05, value: 212.4}, {x: 9.72, y: 4.07, value: 87.9}, {x: 9.75, y: 4.02, value: 154.1}]

const plotsTable = referenceData => ({
    dataSetId: 'plots', name: 'biomass_plots', type: 'EE_TABLE', eeTable: PLOTS_TABLE, valueColumn: 'agb', referenceData
})

const TRAINED_ELSEWHERE_DATA_SET = {dataSetId: 'earlier', name: 'Earlier biomass', type: 'RECIPE', recipe: 'regression-0'}

const compositeImage = {
    imageId: 'image-1', type: 'RECIPE_REF', id: COMPOSITE,
    bandSetSpecs: [{id: 'image-bands', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir', 'swir1']}]
}

const regressionOf = (id, dataSets) => ({
    id, type: 'REGRESSION', revision: 1, ui: {initialized: true},
    model: {
        inputImagery: {images: [compositeImage]},
        trainingData: {dataSets},
        auxiliaryImagery: [],
        classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25, minLeafPopulation: 1, bagFraction: 0.5, seed: 1}
    }
})

const recipes = dataSets => [
    regressionOf(REGRESSION, dataSets),
    regressionOf('regression-0', [plotsTable(PLOTS)]),
    {
        id: REMAPPING, type: 'REMAPPING', revision: 1, ui: {initialized: true},
        model: {
            inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id: REGRESSION, includedBands: [{band: 'regression'}]}]},
            legend: {entries: [{id: 'l-1', value: 1, label: 'High biomass', color: '#006400', booleanOperator: 'and',
                constraints: [{id: 'c-1', image: 'r-1', band: 'regression', operator: '>', value: 150}]}]}
        }
    },
    {
        id: COMPOSITE, type: 'MOSAIC', revision: 1, ui: {initialized: true},
        model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
    }
]

const Runtime = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

// The Regression's map: its Training data button and data set list, and a layer showing its predictions in the style
// Regression presets.
async function open(dataSets) {
    const all = recipes(dataSets)
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(all.map(recipe => [recipe.id, recipe])),
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: REGRESSION}]
        },
        assets: {user: [{id: PLOTS_TABLE, type: 'Table', updateTime: 'T1'}], other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Runtime/>
                <Recipe id={REGRESSION}>
                    <EventShield>
                        <PortalContainer/>
                        <PortalContainer id='panels'/>
                        <PortalContext id='panels'>
                            <Toolbar vertical placement='bottom-right'>
                                <SectionButton
                                    id='trainingData'
                                    label='process.classification.panel.trainingData.button'
                                    tooltip='process.classification.panel.trainingData.tooltip'
                                    panel/>
                            </Toolbar>
                            <TrainingData/>
                        </PortalContext>
                    </EventShield>
                    <TabContext id={REGRESSION} busyIn$={new Subject()}>
                        <MapAreaContext mapArea={{area: 'center', updateLayerConfig: () => {}}}>
                            <RecipeImageLayer
                                source={{id: 'regression-layer', sourceConfig: {recipeId: REGRESSION}}}
                                layerConfig={{visParams: getPreSetVisualizations()[0]}}
                                map={{}}
                            />
                        </MapAreaContext>
                    </TabContext>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

// The data set chosen by its name in the list, opened in its editor.
const editDataSet = name => click([...document.querySelectorAll('*')].reverse()
    .find(element => element.textContent === name))

// The plots table answers the rows it is asked for: a point and its biomass for each.
const answerRows = async plots => {
    await act(async () => fake.rows.forEach(rows$ => {
        rows$.next({
            columns: {agb: 'Number'},
            features: plots.map(({x, y, value}) => ({geometry: {coordinates: [x, y]}, properties: {agb: value}}))
        })
        rows$.complete()
    }))
    await settled()
}

const recipeOf = id => store.getState().process.loadedRecipes[id]

const savedDataSets = () => recipeOf(REGRESSION).model.trainingData.dataSets

const heldFor = key => runtime.heldFor(key)

const evidenceOwnerOf = id => runtime.evidenceOwnerOf(id)

const retrieveAvailable = id =>
    retrieveAvailability({state: store.getState(), recipe: recipeOf(id), evidenceOwnerOf, heldFor, now: Date.now()}).available

const retrieveRead = id => readRetrieveOutput({state: store.getState(), recipeId: id, heldFor, evidenceOwnerOf})

// Why a new preview of the recipe may not be requested, as a layer showing it asks.
const previewGate = id => requestGate({
    state: store.getState(), recipe: recipeOf(id), operation: 'IMAGE_OUTPUT', evidenceOwnerOf, heldFor, now: Date.now()
})

const sectionProblems = id => sourceProblemsOfState(store.getState(), id, evidenceOwnerOf, Date.now(), heldFor)

// What the Training data button says, while it is in its error state.
const trainingDataMark = () => {
    const sectionButton = button('process.classification.panel.trainingData.button')
    return sectionButton.classList.contains(toolbarButtonStyles.error)
        ? JSON.parse(sectionButton.closest('[data-tooltip]').dataset.tooltip)
        : []
}

const applyEnabled = () => button('button.apply')?.disabled === false

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

async function click(element) {
    expect(element).toBeDefined()
    await act(async () => element.click())
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}
