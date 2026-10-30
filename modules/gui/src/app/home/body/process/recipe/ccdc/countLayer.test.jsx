import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe, withRecipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {initStore} from '~/store'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// The count a CCDC's map shows by default is a named map product (type/ccdc.js), described from configuration, and held
// to the analysis prerequisites of its type (analysisPrerequisites, #sepal/recipe/output/readiness): the Classification
// its Sources select trainable. While it cannot be, no preview is requested - Earth Engine would refuse it - and SRC,
// where it is repaired, says why; once repaired it is drawn. A Classification record still to be loaded, or imagery
// still to be observed or unobservable, draws nothing new and finds nothing. Judging it reads what training reads, never
// the CCDC's own description. Over a real store, source runtime, recipe types and layer; the preview, the CCDC's layer
// form, storage and Earth Engine are faked, an asset's bands or a record answered when a test says so.

const fake = vi.hoisted(() => ({observations: [], loads: {}}))
vi.mock('~/apiRegistry', async () => {
    const {NEVER, Observable, of} = await import('rxjs')
    return {default: {
        gee: {
            bands$: request => new Observable(subscriber => {
                fake.observations.push({request, subscriber})
            }),
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
        },
        recipe: {save$: () => NEVER, load$: id => fake.loads[id] || NEVER, loadAll$: () => of(LISTING)}
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
const {notifyError} = vi.hoisted(() => ({notifyError: vi.fn()}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: notifyError}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
// Constructing a preview layer is what requests a preview: the map mounts it and Earth Engine is asked for its tiles.
const previews = vi.hoisted(() => ({constructed: [], shown: undefined}))
vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({
    EarthEngineImageLayer: class {
        constructor({previewRequest, watchedProps}) {
            previews.constructed.push(this)
            this.previewRequest = previewRequest
            this.watchedProps = watchedProps
        }
        removeFromMap() {}
    }
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc')
const {default: classification} = await import('../classification/classification')
const {default: opticalMosaic} = await import('../opticalMosaic/opticalMosaic')
const {getPreSetVisualizations} = await import('./visualizations')
const {RecipeImageLayer} = await import('../recipeImageLayer')
const {addRecipeImageLayer} = await import('../../recipeImageLayerRegistry')
const {withSourceProblems} = await import('../selectedSource')
const {mapProductGate} = await import('../operationAvailability')
const {withSourceRuntime} = await import('../../sourceRuntime/sourceRuntimeContext')
const {TabContext} = await import('~/widget/tabs/tabContext')

addRecipeType(ccdc())
addRecipeType(classification())
addRecipeType(opticalMosaic())
// The CCDC's own layer form is replaced by one that reports the layer it is given to draw.
addRecipeImageLayer('CCDC', ({layer}) => {
    previews.shown = layer
    return null
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

beforeEach(() => {
    previews.constructed = []
    previews.shown = undefined
    fake.observations = []
    fake.loads = {}
    notifyError.mockReset()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['breakpoint bands of the scenes alone', ['ndvi']],
    ['a breakpoint band its Classification computes', ['ndvi', 'probability_1']]
])('the count a CCDC fitting %s shows', (_case, breakpointBands) => {
    it('is not requested while its Classification stores no points, SRC saying why, and is drawn once it does', async () => {
        await open({breakpointBands, trainingData: []})

        expect(previews.constructed).toEqual([])
        expect(notifyError).not.toHaveBeenCalled()
        expect(marked()).toEqual(['sources'])

        await holdTrainingData([COLLECTED])
        expect(previews.constructed).toHaveLength(1)
        expect(previews.shown).toBe(previews.constructed[0])
        expect(previews.shown.previewRequest).toMatchObject({visualizationType: 'COUNT'})
        expect(marked()).toEqual([])
    })

    it('drawn, is taken away once its Classification stores no points', async () => {
        await open({breakpointBands})
        expect(previews.shown).toBe(previews.constructed[0])

        await holdTrainingData([])

        expect(previews.shown).toBeNull()
        expect(previews.constructed).toHaveLength(1)
    })
})

describe('the count a CCDC shows', () => {
    it.each([
        ['a trainable Classification', {}],
        ['no Classification, fitting breakpoint bands of the scenes', {classification: null}],
        ['a supplied decision tree storing no points', {classifier: DECISION_TREE, trainingData: []}]
    ])('is drawn over %s', async (_case, configuration) => {
        await open({breakpointBands: ['ndvi'], ...configuration})

        expect(previews.constructed).toHaveLength(1)
        expect(previews.shown).toBe(previews.constructed[0])
    })

    it('is judged by what training reads, never describing the CCDC\'s own image', async () => {
        await open({breakpointBands: ['ndvi'], input: ASSET_INPUT, marks: false})
        await answerAsset(ASSET_INPUT.id, ['red', 'nir'])

        expect(previews.constructed).toHaveLength(1)
        expect(fake.observations.map(({request}) => request.asset ?? request.recipe?.id)).toEqual([ASSET_INPUT.id])
    })
})

describe('the count a CCDC shows over a Classification whose imagery is not yet known', () => {
    it('is not drawn, nothing found, until the layer has that imagery observed', async () => {
        await open({breakpointBands: ['ndvi'], input: ASSET_INPUT, marks: false})

        expect(previews.constructed).toEqual([])
        expect(gate()).toMatchObject({wait: true, withdraw: false})
        expect(observationsOf(ASSET_INPUT.id)).toHaveLength(1)

        await answerAsset(ASSET_INPUT.id, ['red', 'nir'])
        expect(previews.constructed).toHaveLength(1)
        expect(previews.shown).toBe(previews.constructed[0])
    })

    it('is not drawn, nothing found, where that imagery cannot be observed', async () => {
        await open({breakpointBands: ['ndvi'], input: ASSET_INPUT, marks: false})

        await failAsset(ASSET_INPUT.id)

        expect(previews.constructed).toEqual([])
        expect(gate()).toMatchObject({withdraw: false, code: 'SOURCE_UNAVAILABLE'})
        expect(notifyError).not.toHaveBeenCalled()
    })
})

describe('the count a CCDC shows over a Classification the session does not yet hold', () => {
    it('is not drawn, nothing found, until that record is loaded, then drawn over a trainable one', async () => {
        const loaded = new Subject()
        fake.loads[CLASSIFICATION] = loaded
        await open({breakpointBands: ['ndvi'], classificationHeld: false, marks: false})

        expect(previews.constructed).toEqual([])
        expect(gate()).toMatchObject({wait: true, withdraw: false})

        await act(async () => {
            loaded.next(classificationRecipe({input: MOSAIC_INPUT, trainingData: [COLLECTED]}))
            loaded.complete()
        })
        await settled()
        expect(previews.constructed).toHaveLength(1)
    })

    it('is not drawn once that record is loaded storing no points, finding it', async () => {
        const loaded = new Subject()
        fake.loads[CLASSIFICATION] = loaded
        await open({breakpointBands: ['ndvi'], classificationHeld: false, marks: false})

        await act(async () => {
            loaded.next(classificationRecipe({input: MOSAIC_INPUT, trainingData: []}))
            loaded.complete()
        })
        await settled()

        expect(previews.constructed).toEqual([])
        expect(gate()).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET'})
    })
})

const CCDC = 'ccdc-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const DECISION_TREE = {type: 'DECISION_TREE', decisionTree: '1) root 9 0 0 (0 1) *'}
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}
const MOSAIC_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}
const ASSET_INPUT = {imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}

const LISTING = [
    {id: CCDC, name: 'CCDC', type: 'CCDC', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Mosaic', type: 'MOSAIC', revision: 1}
]

// Over Landsat 8 scenes, its Sources selecting the Classification, unless `classification` is null, fitting the
// breakpoint bands given.
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

// A classifier - a Random Forest unless said - over `input`, storing the training data given.
const classificationRecipe = ({input, trainingData, classifier = {type: 'RANDOM_FOREST'}}) => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    title: 'Classification',
    revision: 1,
    model: {
        inputImagery: {images: [input]},
        legend: {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]},
        classifier,
        trainingData: {dataSets: trainingData}
    },
    ui: {initialized: true}
})

// Why the count may not be requested now, as the layer judges it.
const gate = () => {
    const state = store.getState()
    return mapProductGate({state, recipe: state.process.loadedRecipes[CCDC], product: {name: 'COUNT'}, heldFor: key => runtime.heldFor(key)})
}

// The sections the toolbar marks as needing attention.
const marked = () => Object.keys(JSON.parse(container.querySelector('output[aria-label=marks]').dataset.marks))

// The sections the toolbar marks, as it watches what marking them needs.
const SectionMarks = compose(
    ({sourceProblems}) => <output aria-label='marks' data-marks={JSON.stringify(tooltipText(sourceProblems))}/>,
    withSourceProblems(),
    withRecipe(recipe => ({recipeId: recipe.id}))
)

// The Classification's training data as the session holds it.
const holdTrainingData = async dataSets => {
    await act(async () => actionBuilder('EDIT_TRAINING_DATA')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], dataSets)
        .dispatch())
    await settled()
}

// What Earth Engine has been asked of an asset's bands.
const observationsOf = assetId =>
    fake.observations.filter(({request}) => request.asset === assetId)

// Earth Engine answers what is still waiting to be observed of an asset: these bands, each scalar.
const answerAsset = async (assetId, names) => {
    await act(async () => fake.observations
        .filter(({request, answered}) => !answered && request.asset === assetId)
        .forEach(observation => {
            observation.answered = true
            observation.subscriber.next(names.map(name => ({name, arrayDimensions: 0})))
            observation.subscriber.complete()
        }))
    await settled()
}

// Earth Engine cannot be reached for what is still waiting to be observed of an asset.
const failAsset = async assetId => {
    await act(async () => fake.observations
        .filter(({request, answered}) => !answered && request.asset === assetId)
        .forEach(observation => {
            observation.answered = true
            observation.subscriber.error(new Error('Earth Engine unreachable'))
        }))
    await settled()
}

const Runtime = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

// The CCDC's map, showing its count in the style its type offers, beside its toolbar's marks unless `marks` is false.
// `classificationHeld: false`: the session does not hold the Classification's record, which storage answers when a test
// says so.
async function open({breakpointBands, classification, input = MOSAIC_INPUT, trainingData = [COLLECTED], classifier, classificationHeld = true, marks = true}) {
    const records = [
        ccdcRecipe({breakpointBands, classification}),
        ...(classificationHeld ? [classificationRecipe({input, trainingData, classifier})] : []),
        mosaicRecipe()
    ]
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: CCDC}]
        },
        assets: {user: [], other: []},
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
                <Recipe id={CCDC}>
                    <TabContext id={CCDC} busyIn$={new Subject()}>
                        {marks ? <SectionMarks/> : null}
                        <RecipeImageLayer
                            source={{id: 'ccdc-layer', sourceConfig: {recipeId: CCDC}}}
                            layerConfig={{visParams: getPreSetVisualizations()[0]}}
                            map={{}}
                        />
                    </TabContext>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}
