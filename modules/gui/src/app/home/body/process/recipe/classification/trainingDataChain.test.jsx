import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'

// A Classification whose classifier is trained, saved without training data, and the recipes whose running builds its
// image: a Stack that a Class Change selects as both its images, a Remapping, and a Masking by it and of it. What the
// Classification's configuration lacks keeps every one of them from running, whether or not its description reads the
// Classification, and is said where the operations it holds are (#sepal/recipe/output/readiness). A Stack layer on the
// Class Change's map is taken away while it holds, and drawn again once training data is added. What is not yet observed is
// waited for, never found; what an asset is found to lack goes once it is observed again holding it; a finding settles
// what is watched, while an editor's explanation reads the rest; and an asset found missing is said as that, finding
// nothing of a configuration. Over a real store, source runtime and recipe types;
// Earth Engine is faked, answering an asset's bands when a test says so.

const fake = vi.hoisted(() => ({observations: [], missing: new Set()}))
vi.mock('~/apiRegistry', async () => {
    const {NEVER, Observable, of} = await import('rxjs')
    return {default: {
        gee: {
            bands$: request => new Observable(subscriber => {
                fake.observations.push({request, subscriber})
            }),
            assetVersions$: ({ids}) => of({assets: ids.map(id => fake.missing.has(id)
                ? {id, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}}
                : {id, type: 'IMAGE', version: 'v1'})})
        },
        recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of(LISTING)}
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(Boolean))}>{children}</span>
        : children
}))
// Constructing a preview layer is what requests a preview: the map mounts it and Earth Engine is asked for its tiles.
const previews = vi.hoisted(() => ({constructed: [], shown: undefined}))
vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({
    EarthEngineImageLayer: class {
        constructor({watchedProps}) {
            previews.constructed.push(this)
            this.watchedProps = watchedProps
        }
        removeFromMap() {}
    }
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: classification} = await import('./classification')
const {default: stack} = await import('../stack/stack')
const {default: classChange} = await import('../classChange/classChange')
const {default: remapping} = await import('../remapping/remapping')
const {default: masking} = await import('../masking/masking')
const {canPreview, readRecipeOutput} = await import('../recipeOutput')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {assetEvidenceOfState} = await import('../../sourceRuntime/assetEvidence')
const {recordStalenessOfState} = await import('../../sourceRuntime/recordCurrency')
const {getPreSetVisualizations} = await import('../stack/visualizations')
const {retrieveAvailability} = await import('../operationAvailability')
const {physicalRequest, readRetrieveOutput, submitRetrieve} = await import('../retrieveOutput')
const {requestGate} = await import('../sourceRequirements')
const {sourceProblemsOfState} = await import('../selectedSourceStatus')
const {RecipeImageLayer} = await import('../recipeImageLayer')
const {addRecipeImageLayer} = await import('../../recipeImageLayerRegistry')
const {TabContext} = await import('~/widget/tabs/tabContext')
const {VisualizationSelector} = await import('~/app/home/map/imageLayerSource/visualizationSelector')
const {MapAreaContext} = await import('~/app/home/map/mapAreaContext')

addRecipeType(classification())
addRecipeType(stack())
addRecipeType(classChange())
addRecipeType(remapping())
addRecipeType(masking())
// Stack's own layer form is replaced by one that reports the layer it is given to draw, and shows the selector every
// layer form shows, where a layer says what is known of its sources.
addRecipeImageLayer('STACK', ({layer, source, recipe}) => {
    previews.shown = layer
    return (
        <MapAreaContext mapArea={{area: 'center', updateLayerConfig: () => {}}}>
            <VisualizationSelector source={source} recipe={recipe}/>
        </MapAreaContext>
    )
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

beforeEach(() => {
    previews.constructed = []
    previews.shown = undefined
    fake.observations = []
    fake.missing = new Set()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a Classification without training data', () => {
    it('holds its own Retrieve and previews, naming its Training data section, which its toolbar leaves unmarked', async () => {
        await onChangeMap()

        expect(sectionProblems(CLASSIFICATION)).toEqual({})
        expect(retrieveAvailable(CLASSIFICATION)).toBe(false)
        expect(previewGate(CLASSIFICATION)).toMatchObject({withdraw: true, section: 'process.classification.panel.trainingData.button'})
    })

    it.each([
        ['a Stack reading it', () => STACK],
        ['a Class Change over that Stack', () => CHANGE],
        ['a Remapping, whose description reads nothing of it', () => REMAPPING],
        ['a Masking by it, whose description reads only its image', () => MASKED_BY],
        ['a Masking of it', () => MASK_OF]
    ])('holds %s from running, Retrieve and previews alike, for the Classification\'s finding alone', async (_case, idOf) => {
        const id = idOf()
        await onChangeMap()

        expect(retrieveRead(id).output.readiness).toMatchObject({
            status: 'NOT_READY',
            findings: [expect.objectContaining({code: 'NO_TRAINING_DATA', recipePath: [id, ...upstreamOf(id), CLASSIFICATION]})]
        })
        expect(retrieveAvailable(id)).toBe(false)
        expect(previewGate(id)).toMatchObject({withdraw: true})
        expect(sectionProblems(id)).toEqual({})
    })

    it('refuses to submit the Remapping\'s Retrieve', async () => {
        await onChangeMap()
        const submitTask = vi.fn()
        const {recipe, output, pending} = retrieveRead(REMAPPING)

        const submitted = submitRetrieve({recipe, output, pending, request: physicalRequest({output}), submitTask})

        expect(submitted).toBe(false)
        expect(submitTask).not.toHaveBeenCalled()
    })

    it('holds nothing once training data across two classes is added', async () => {
        await onChangeMap()

        await act(async () => setTrainingData(TRAINING_DATA))

        for (const id of [CLASSIFICATION, STACK, CHANGE, REMAPPING, MASKED_BY, MASK_OF]) {
            expect(retrieveAvailable(id)).toBe(true)
            expect(previewGate(id)).toBeNull()
            expect(sectionProblems(id)).toEqual({})
        }
    })
})

describe('a Masking selecting no mask', () => {
    it('is marked on its mask section, and cannot run', async () => {
        await onChangeMap(TRAINING_DATA)

        expect(sectionProblems(MASK_NONE)).toEqual({imageMask: 'process.masking.panel.inputImage.imageMask.missing'})
        expect(retrieveAvailable(MASK_NONE)).toBe(false)
        expect(previewGate(MASK_NONE)).toMatchObject({withdraw: true, section: 'process.masking.panel.inputImage.imageMask.button.label'})
    })
})

describe('a Remapping over a Classification of an asset', () => {
    // What is still being observed holds no action that would start watching it; nothing is drawn or exported meanwhile.
    it('waits while that asset is observed, drawing nothing, its Retrieve pending, and finding nothing', async () => {
        await onChangeMap(TRAINING_DATA)

        await watched(REMAPPING_OF_ASSET)

        const {output, pending} = retrieveRead(REMAPPING_OF_ASSET)
        expect(output.readiness).toMatchObject({status: 'NEEDS_EVIDENCE', findings: []})
        expect(canPreview(output)).toBe(false)
        expect(pending).toBe(true)
        expect(sectionProblems(REMAPPING_OF_ASSET)).toEqual({})
    })

    it('cannot run while the asset is observed lacking the band the Classification selects, and can once it is observed again holding it', async () => {
        await onChangeMap(TRAINING_DATA)
        await watched(REMAPPING_OF_ASSET)
        await answerAsset(DEM, ['slope'])
        expect(retrieveRead(REMAPPING_OF_ASSET).output.readiness.findings).toEqual([
            expect.objectContaining({code: 'MISSING_INPUT_BAND', recipePath: [REMAPPING_OF_ASSET, CLASSIFICATION_OF_ASSET]})
        ])

        const refreshed = runtime.refreshOutput(question(REMAPPING_OF_ASSET))
        await settled()
        await answerAsset(DEM, ['elevation'])
        await act(async () => refreshed)

        expect(retrieveRead(REMAPPING_OF_ASSET).output.readiness).toMatchObject({status: 'READY', findings: []})
        expect(retrieveAvailable(REMAPPING_OF_ASSET)).toBe(true)
    })
})

describe('a Remapping over a Classification of an asset, without training data', () => {
    // A finding settles whether it can run, so watching it reads nothing more; an editor explaining it reads the rest.
    it('cannot run at once, observing nothing, and is explained by observing the asset, finding the band it lacks too', async () => {
        await onChangeMap(TRAINING_DATA)
        await watched(REMAPPING_OF_UNTRAINED)
        expect(observationsOf(DEM)).toEqual([])

        await watched(REMAPPING_OF_UNTRAINED, {explain: true})
        expect(observationsOf(DEM)).toHaveLength(1)
        await answerAsset(DEM, ['slope'])

        const {readiness} = explainedRead(REMAPPING_OF_UNTRAINED)
        expect(readiness.status).toBe('NOT_READY')
        expect(readiness.findings.map(({code, recipePath}) => [code, recipePath])).toEqual(expect.arrayContaining([
            ['NO_TRAINING_DATA', [REMAPPING_OF_UNTRAINED, UNTRAINED_OF_ASSET]],
            ['MISSING_INPUT_BAND', [REMAPPING_OF_UNTRAINED, UNTRAINED_OF_ASSET]]
        ]))
        expect(readiness.findings).toHaveLength(2)
    })
})

describe('a Masking whose mask asset is found missing', () => {
    it('is withheld naming the asset, which finds nothing of its configuration', async () => {
        fake.missing.add(MASK_ASSET)
        await onChangeMap(TRAINING_DATA)

        await watched(MASKED_BY_ASSET)

        const {output} = retrieveRead(MASKED_BY_ASSET)
        expect(output.diagnostics).toContainEqual({code: 'ASSET_UNAVAILABLE', assetId: MASK_ASSET})
        expect(output.readiness).toMatchObject({status: 'UNAVAILABLE', findings: []})
        expect(canPreview(output)).toBe(false)
        expect(retrieveAvailable(MASKED_BY_ASSET)).toBe(false)
        expect(sectionProblems(MASKED_BY_ASSET)).toEqual({})
    })
})

describe('a Stack layer drawn on the Class Change\'s map', () => {
    it('is taken away once the Classification\'s training data is cleared, saying to review the Classification', async () => {
        await onChangeMap(TRAINING_DATA)
        expect(previews.shown).toBe(previews.constructed[0])

        await act(async () => setTrainingData([]))

        expect(previews.shown).toBeNull()
        expect(layerErrors()).toEqual(['map.layerSource.heldUpstream {"recipe":"Stacked","source":"Land cover"}'])
    })

    it('is drawn again once training data is added back', async () => {
        await onChangeMap(TRAINING_DATA)
        await act(async () => setTrainingData([]))

        await act(async () => setTrainingData(TRAINING_DATA))

        expect(previews.constructed).toHaveLength(2)
        expect(previews.shown).toBe(previews.constructed[1])
        expect(layerErrors()).toEqual([])
    })
})

const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const STACK = 'stack-1'
const CHANGE = 'change-1'
const REMAPPING = 'remapping-1'
const MASKED_BY = 'masked-by-1'
const MASK_OF = 'mask-of-1'
const MASK_NONE = 'mask-none-1'
const CLASSIFICATION_OF_ASSET = 'classification-of-asset-1'
const REMAPPING_OF_ASSET = 'remapping-of-asset-1'
const MASKED_BY_ASSET = 'masked-by-asset-1'
const UNTRAINED_OF_ASSET = 'untrained-of-asset-1'
const REMAPPING_OF_UNTRAINED = 'remapping-of-untrained-1'
const DEM = 'users/x/dem'
const MASK_ASSET = 'users/x/mask'

const LISTING = [
    {id: CLASSIFICATION, name: 'Land cover', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Imagery', type: 'MOSAIC', revision: 1},
    {id: STACK, name: 'Stacked', type: 'STACK', revision: 1},
    {id: CHANGE, name: 'Change', type: 'CLASS_CHANGE', revision: 1},
    {id: REMAPPING, name: 'Remapped', type: 'REMAPPING', revision: 1},
    {id: MASKED_BY, name: 'Masked by land cover', type: 'MASKING', revision: 1},
    {id: MASK_OF, name: 'Land cover masked', type: 'MASKING', revision: 1},
    {id: MASK_NONE, name: 'Unmasked', type: 'MASKING', revision: 1},
    {id: CLASSIFICATION_OF_ASSET, name: 'Land cover of elevation', type: 'CLASSIFICATION', revision: 1},
    {id: REMAPPING_OF_ASSET, name: 'Remapped elevation classes', type: 'REMAPPING', revision: 1},
    {id: MASKED_BY_ASSET, name: 'Masked by an asset', type: 'MASKING', revision: 1},
    {id: UNTRAINED_OF_ASSET, name: 'Untrained land cover of elevation', type: 'CLASSIFICATION', revision: 1},
    {id: REMAPPING_OF_UNTRAINED, name: 'Remapped untrained classes', type: 'REMAPPING', revision: 1}
]

// The recipes between one reading the Classification and the Classification itself.
const upstreamOf = id => id === CHANGE ? [STACK] : []

const LEGEND = [{id: 'forest', value: 1, label: 'Forest', color: '#006400'}, {id: 'water', value: 2, label: 'Water', color: '#0000ff'}]

const point = (x, y, value) => ({x, y, class: value})

// Three points of each class, collected on the map.
const TRAINING_DATA = [
    point(-60.30, -2.80, 1), point(-60.31, -2.81, 1), point(-60.29, -2.79, 1),
    point(-60.02, -3.13, 2), point(-60.03, -3.14, 2), point(-60.01, -3.135, 2)
]

const CLASS_VISUALIZATION = {
    id: 'class', type: 'categorical', bands: ['class'], values: [1, 2], labels: ['Forest', 'Water'], palette: ['#006400', '#0000ff']
}

const classificationOf = (id, input, referenceData) => ({
    id, type: 'CLASSIFICATION', revision: 1, ui: {initialized: true},
    model: {
        inputImagery: {images: [{imageId: 'image-1', ...input}]},
        legend: {entries: LEGEND},
        trainingData: {dataSets: [{dataSetId: 'collected', name: 'Collected', type: 'COLLECTED', referenceData}]},
        auxiliaryImagery: [],
        classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25}
    }
})

const remappingOf = (id, source) => ({
    id, type: 'REMAPPING', revision: 1, ui: {initialized: true},
    model: {
        inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id: source, includedBands: [{band: 'class'}]}]},
        legend: {entries: [{id: 'l-1', value: 1, label: 'Forest', color: '#006400', booleanOperator: 'and',
            constraints: [{id: 'c-1', image: 'r-1', band: 'class', operator: '=', value: 1}]}]}
    }
})

const maskingOf = (id, image, mask) => ({
    id, type: 'MASKING', revision: 1, ui: {initialized: true},
    model: {imageToMask: image, ...(mask && {imageMask: mask})}
})

const recipeRef = id => ({type: 'RECIPE_REF', id})

const imageBands = included => ({bandSetSpecs: [{id: 'image-bands', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included}]})

const recipes = referenceData => [
    classificationOf(CLASSIFICATION, {type: 'RECIPE_REF', id: MOSAIC, ...imageBands(['red', 'nir'])}, referenceData),
    classificationOf(CLASSIFICATION_OF_ASSET, {type: 'ASSET', id: DEM, ...imageBands(['elevation'])}, TRAINING_DATA),
    remappingOf(REMAPPING, CLASSIFICATION),
    remappingOf(REMAPPING_OF_ASSET, CLASSIFICATION_OF_ASSET),
    classificationOf(UNTRAINED_OF_ASSET, {type: 'ASSET', id: DEM, ...imageBands(['elevation'])}, []),
    remappingOf(REMAPPING_OF_UNTRAINED, UNTRAINED_OF_ASSET),
    maskingOf(MASKED_BY, recipeRef(MOSAIC), recipeRef(CLASSIFICATION)),
    maskingOf(MASK_OF, recipeRef(CLASSIFICATION), recipeRef(MOSAIC)),
    maskingOf(MASK_NONE, recipeRef(MOSAIC)),
    maskingOf(MASKED_BY_ASSET, recipeRef(MOSAIC), {type: 'ASSET', id: MASK_ASSET}),
    {
        id: MOSAIC, type: 'MOSAIC', revision: 1, ui: {initialized: true},
        model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
    },
    {
        id: STACK, type: 'STACK', revision: 1, ui: {initialized: true},
        model: {
            inputImagery: {images: [{imageId: 'stacked-1', type: 'RECIPE_REF', id: CLASSIFICATION, visualizations: [CLASS_VISUALIZATION]}]},
            bandNames: {bandNames: [{imageId: 'stacked-1', bands: [{id: 'band-1', originalName: 'class', outputName: 'class'}]}]}
        }
    },
    {
        id: CHANGE, type: 'CLASS_CHANGE', revision: 1, ui: {initialized: true},
        model: {
            fromImage: {type: 'RECIPE_REF', id: STACK, band: 'class', legendEntries: LEGEND},
            toImage: {type: 'RECIPE_REF', id: STACK, band: 'class', legendEntries: LEGEND},
            legend: {entries: []},
            options: {minConfidence: 0}
        }
    }
]

const Runtime = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

// The Class Change's map, showing the Stack as a layer in the style its input offers, the Classification holding these
// points.
async function onChangeMap(referenceData = []) {
    const all = recipes(referenceData)
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(all.map(recipe => [recipe.id, recipe])),
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: CHANGE}]
        },
        assets: {user: [], other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const stacked = all.find(({id}) => id === STACK)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Runtime/>
                <Recipe id={CHANGE}>
                    <TabContext id={CHANGE} busyIn$={new Subject()}>
                        <RecipeImageLayer
                            source={{id: 'stack-layer', sourceConfig: {recipeId: STACK}}}
                            layerConfig={{visParams: getPreSetVisualizations(stacked)[0]}}
                            map={{}}
                        />
                    </TabContext>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

// The recipe's output watched, as a layer or Retrieve showing it watches it - or, asked to explain, as its editor does.
const question = (id, {explain} = {}) => ({recipeId: id, product: {name: 'IMAGE_OUTPUT'}, ...(explain && {explain})})

const watched = async (id, options) => {
    await act(async () => runtime.watchOutput$(question(id, options)).subscribe())
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

// The points collected on the map, as the Classification's collection sets them.
const setTrainingData = points =>
    actionBuilder('SET_REFERENCE_DATA')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets', {dataSetId: 'collected'}, 'referenceData'], points)
        .dispatch()

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

const recipeOf = id => store.getState().process.loadedRecipes[id]

const heldFor = key => runtime.heldFor(key)

const evidenceOwnerOf = id => runtime.evidenceOwnerOf(id)

const retrieveAvailable = id =>
    retrieveAvailability({state: store.getState(), recipe: recipeOf(id), evidenceOwnerOf, heldFor, now: Date.now()}).available

const retrieveRead = id => readRetrieveOutput({state: store.getState(), recipeId: id, heldFor, evidenceOwnerOf})

// The recipe's output as its editor reads it, asked to explain a refusal.
const explainedRead = id => {
    const state = store.getState()
    const recipe = recipeOf(id)
    return readRecipeOutput({
        recipe,
        product: {name: 'IMAGE_OUTPUT'},
        graph: buildMapDependencyGraph({recipe, loadedRecipes: state.process.loadedRecipes}),
        heldFor,
        currency: recordStalenessOfState(state),
        assetEvidence: assetEvidenceOfState(state),
        explain: true
    })
}

// Why a new preview of the recipe may not be requested, as a layer showing it asks, on this map or another.
const previewGate = id => requestGate({
    state: store.getState(), recipe: recipeOf(id), operation: 'IMAGE_OUTPUT', evidenceOwnerOf, heldFor, now: Date.now()
})

// What the recipe's toolbar marks, by section.
const sectionProblems = id => sourceProblemsOfState(store.getState(), id, evidenceOwnerOf, Date.now(), heldFor)

// What the layer's selector says is wrong with what it shows.
const layerErrors = () => {
    const tooltip = container.querySelector('[data-label="map.visualizationSelector.label"] [data-feedback="error"]')
        ?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}
