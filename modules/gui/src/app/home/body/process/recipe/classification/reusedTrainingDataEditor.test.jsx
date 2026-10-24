import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// The editor of a Classification's or Regression's data set reusing another recipe's training data, which that recipe
// cannot produce: it says so beside the recipe reused, once, as the repair - the recipe at fault, further up a chain of
// reuse where it is that one, fixed, or another recipe selected - after what that recipe lacks, where that is known; it
// offers no action of its own on that recipe. What it confirms holds Apply, a submitted form included: another recipe can
// be chosen, which is judged afresh, Cancel keeps what was applied, and opened and left as it is, it offers Close, not
// Apply. What is said of another data set's recipe stays on that data set, and holds nothing there. The panels, store, source runtime and recipe types are real; storage answers
// from stored records, Earth Engine an asset's bands at once.

// `answers`: what storage answers for a recipe, where not at once.
const stored = vi.hoisted(() => ({records: {}, answers: {}}))
const editing = vi.hoisted(() => ({dataSetId: null}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => of(['red', 'nir'].map(name => ({name, arrayDimensions: 0}))),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {load$: id => stored.answers[id] || of(stored.records[id]), loadAll$: () => of(listing()), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${[key].flat().join('.')} ${JSON.stringify(values)}` : [key].flat().join('.')}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
// The editor of one data set is open: the one reusing the recipe that cannot produce its training data, unless a case
// edits another.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: ({id} = {}) => Component => props => id === 'trainingDataSet'
        ? <Component {...props} activatable={{active: true, dataSetId: editing.dataSetId, activate: () => {}, deactivate: () => {}}}/>
        : null
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: classification} = await import('./classification')
const {default: regression} = await import('../regression/regression')
const {TrainingDataSet: ClassificationTrainingDataSet} = await import('./panels/trainingData/trainingDataSet')
const {TrainingDataSet: RegressionTrainingDataSet} = await import('../regression/panels/trainingData/trainingDataSet')
const {sourceProblemsOfState} = await import('../selectedSourceStatus')

addRecipeType(classification())
addRecipeType(regression())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

afterEach(async () => {
    stored.answers = {}
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['CLASSIFICATION', ClassificationTrainingDataSet],
    ['REGRESSION', RegressionTrainingDataSet]
])('the editor of a %s data set reusing a recipe that cannot produce its training data', (type, TrainingDataSet) => {
    it('says once, beside that recipe, to fix it or select another, and can be closed', async () => {
        await open(type, TrainingDataSet)

        expect(errorsOf(RECIPE_LABEL)).toEqual([repair(PROVIDER_NAME)])
        expect(shown()).not.toContain(REPAIR)
        expect(recipeFieldActions()).toEqual([])
        expect(button('button.close').disabled).toBe(false)
    })

    it('says what that recipe samples without before the repair, where that is what it lacks', async () => {
        await open(type, TrainingDataSet, {providerImages: [SELECTING_RED]})

        expect(errorsOf(RECIPE_LABEL)).toEqual([missingNir(PROVIDER_NAME)])
    })

    it('says nothing of it once a recipe that can produce it is chosen instead, which Apply saves', async () => {
        await open(type, TrainingDataSet)

        await choose(OTHER_NAME)

        expect(errorsOf(RECIPE_LABEL)).toEqual([])
        expect(shown()).not.toContain(REPAIR)
        await press(button('button.apply'))
        expect(reusedDataSet().recipe).toBe(OTHER)
        expect(toolbarProblems().trainingData).toBeUndefined()
    })

    it('left unchanged, offers Close, not Apply, and leaves the data set saying so', async () => {
        await open(type, TrainingDataSet)
        expect(button('button.apply')).toBeUndefined()

        await press(button('button.close'))

        expect(reusedDataSet()).toEqual(reusing(PROVIDER))
        expect(toolbarProblems().trainingData).toContain(`"recipe":"${PROVIDER_NAME}"`)
    })

    it('keeps the recipe applied on Cancel, once another was chosen', async () => {
        await open(type, TrainingDataSet)
        await choose(OTHER_NAME)

        await press(button('button.cancel'))

        expect(reusedDataSet().recipe).toBe(PROVIDER)
    })

    // What is said of another data set's recipe stays on that data set's item, and on the toolbar.
    it('says nothing of another data set\'s recipe in the editor of one reusing a recipe that can produce its training data', async () => {
        await open(type, TrainingDataSet, {editing: HEALTHY_ID})

        expect(errorsOf(RECIPE_LABEL)).toEqual([])
        expect(shown()).not.toContain(REPAIR)
        expect(toolbarProblems().trainingData).toContain(`"recipe":"${PROVIDER_NAME}"`)
    })

    it('names the recipe at fault further up its reuse as the one to fix', async () => {
        await open(type, TrainingDataSet, {reused: MIDDLE})

        expect(errorsOf(RECIPE_LABEL)).toEqual([repair(PROVIDER_NAME)])
    })
})

describe.each([
    ['CLASSIFICATION', ClassificationTrainingDataSet],
    ['REGRESSION', RegressionTrainingDataSet]
])('the editor of a %s data set reusing a recipe, opened', (type, TrainingDataSet) => {
    it('offers Close, not Apply, over a recipe that can produce its training data', async () => {
        await open(type, TrainingDataSet, {editing: HEALTHY_ID})

        expect(button('button.apply')).toBeUndefined()
        expect(button('button.close')).toBeDefined()
    })

    it('keeps the name the data set was saved with, offering Close', async () => {
        await open(type, TrainingDataSet, {editing: HEALTHY_ID, savedName: 'Field plots'})

        expect(button('button.apply')).toBeUndefined()
        await press(button('button.close'))
        expect(dataSet(HEALTHY_ID).name).toBe('Field plots')
    })

    it('offers Apply once another recipe is chosen, naming the data set after it', async () => {
        await open(type, TrainingDataSet, {editing: HEALTHY_ID, savedName: 'Field plots'})

        await choose(SPARE_NAME)
        await press(button('button.apply'))

        expect(dataSet(HEALTHY_ID)).toMatchObject({recipe: SPARE, name: SPARE_NAME})
    })

    it('keeps a recipe chosen while the one it was saved with is still being read, whatever that read answers later', async () => {
        const answer = new Subject()
        stored.answers[OTHER] = answer
        await open(type, TrainingDataSet, {editing: HEALTHY_ID, savedName: 'Field plots', held: [CONSUMER, PROVIDER, MIDDLE, SPARE]})

        await choose(SPARE_NAME)
        await act(async () => answer.next(stored.records[OTHER]))
        await settled()
        await press(button('button.apply'))

        expect(dataSet(HEALTHY_ID)).toMatchObject({recipe: SPARE, name: SPARE_NAME})
    })
})

// The editor of a data set reusing a recipe that can produce its training data, beside the broken one.
describe.each([
    ['CLASSIFICATION', ClassificationTrainingDataSet],
    ['REGRESSION', RegressionTrainingDataSet]
])('choosing another recipe in the editor of a %s data set', (type, TrainingDataSet) => {
    it.each([
        ['samples without a feature it trains on', [SELECTING_RED], [missingNir(PROVIDER_NAME)]],
        ['cannot produce its training data', [], [repair(PROVIDER_NAME)]]
    ])('holds Apply for one that %s, saying why, and a submitted form changes nothing', async (_case, providerImages, explained) => {
        await open(type, TrainingDataSet, {editing: HEALTHY_ID, providerImages})

        await choose(PROVIDER_NAME)

        expect(errorsOf(RECIPE_LABEL)).toEqual(explained)
        expect(button('button.apply').disabled).toBe(true)
        await submitForm()
        expect(dataSet(HEALTHY_ID)).toEqual(reusing(OTHER, HEALTHY_ID))
    })

    it('recovers once the recipe chosen is repaired, Apply saving it', async () => {
        await open(type, TrainingDataSet, {editing: HEALTHY_ID})
        await choose(PROVIDER_NAME)
        expect(button('button.apply').disabled).toBe(true)

        await act(async () => actionBuilder('REPAIR')
            .set(['process.loadedRecipes', PROVIDER, 'model.inputImagery.images'], [ASSET_IMAGE])
            .dispatch())
        await settled()

        expect(errorsOf(RECIPE_LABEL)).toEqual([])
        await press(button('button.apply'))
        expect(dataSet(HEALTHY_ID).recipe).toBe(PROVIDER)
    })

    it('saves a recipe that can produce its training data', async () => {
        await open(type, TrainingDataSet, {editing: HEALTHY_ID})

        await choose(SPARE_NAME)

        expect(errorsOf(RECIPE_LABEL)).toEqual([])
        await press(button('button.apply'))
        expect(dataSet(HEALTHY_ID).recipe).toBe(SPARE)
    })

    it('keeps the recipe applied on Cancel, once one that cannot produce it was chosen', async () => {
        await open(type, TrainingDataSet, {editing: HEALTHY_ID})
        await choose(PROVIDER_NAME)

        await press(button('button.cancel'))

        expect(dataSet(HEALTHY_ID)).toEqual(reusing(OTHER, HEALTHY_ID))
    })
})

const CONSUMER = 'consumer-1'
const PROVIDER = 'provider-1'
const MIDDLE = 'middle-1'
const OTHER = 'other-1'
const SPARE = 'spare-1'
const PROVIDER_NAME = 'Provider'
const MIDDLE_NAME = 'Middle'
const OTHER_NAME = 'Other'
const SPARE_NAME = 'Spare'
const REUSED_ID = 'reused'
const HEALTHY_ID = 'healthy'
// Earth Engine answers every asset with red and nir alone.
const SELECTING_RED = {imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red']}]}
const RECIPE_LABEL = 'widget.recipeInput.label'
const ASSET_IMAGE = {imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}
const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: POINTS}

const REPAIR = 'process.classification.panel.trainingData.reusedRecipe.repair'

const repair = recipe => `${REPAIR} {"recipes":"${recipe}","count":1}`

const missingNir = recipe => `process.classification.panel.trainingData.missingFeatures {"recipe":"${recipe}","features":"nir"} ${repair(recipe)}`

const NAMES = {[CONSUMER]: 'Consumer', [PROVIDER]: PROVIDER_NAME, [MIDDLE]: MIDDLE_NAME, [OTHER]: OTHER_NAME, [SPARE]: SPARE_NAME}

const listing = () => Object.values(stored.records).map(({id, type}) => ({id, name: NAMES[id], type, revision: 1}))

const recipeOf = (type, id, {images = [ASSET_IMAGE], dataSets = [COLLECTED]} = {}) => ({
    id,
    type,
    title: NAMES[id],
    revision: 1,
    model: {
        inputImagery: {images},
        legend: {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets}
    },
    ui: {initialized: true}
})

const reusing = (recipe, dataSetId = REUSED_ID) => ({dataSetId, type: 'RECIPE', name: NAMES[recipe], recipe})

// The consumer, trained on its own points, on those of `reused` and on those of the other recipe - saved under
// `savedName` where given. The provider is over `providerImages`, by default none to sample its points over; the middle
// recipe reuses the provider's; the other recipe, and a spare one, can produce their own.
const recipesOf = (type, {reused, providerImages = [], savedName}) => [
    recipeOf(type, CONSUMER, {dataSets: [
        COLLECTED,
        reusing(reused),
        {...reusing(OTHER, HEALTHY_ID), ...(savedName && {name: savedName})}
    ]}),
    recipeOf(type, PROVIDER, {images: providerImages}),
    recipeOf(type, MIDDLE, {dataSets: [COLLECTED, reusing(PROVIDER)]}),
    recipeOf(type, OTHER),
    recipeOf(type, SPARE)
]

const dataSet = id => store.getState().process.loadedRecipes[CONSUMER].model.trainingData.dataSets
    .find(({dataSetId}) => dataSetId === id)

const reusedDataSet = () => dataSet(REUSED_ID)

const toolbarProblems = () =>
    sourceProblemsOfState(store.getState(), CONSUMER, id => runtime.evidenceOwnerOf(id), Date.now(), key => runtime.heldFor(key))

const shown = () => document.body.textContent

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

// The actions the label of the recipe reused offers: buttons in the label above its input.
const recipeFieldActions = () => [...field(RECIPE_LABEL).firstElementChild.querySelectorAll('button')].map(({textContent}) => textContent)

// The editor's form submitted as Enter in a field submits it, past its buttons.
const submitForm = async () => {
    const form = document.querySelector('form')
    expect(form, 'the editor has no form to submit').not.toBe(null)
    await act(async () => form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable: true})))
    await settled()
}

const press = async pressed => {
    expect(pressed).toBeDefined()
    await act(async () => pressed.click())
    await settled()
}

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label).querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const choose = async name => {
    await act(async () => field(RECIPE_LABEL).querySelector('input').click())
    const option = [...document.querySelectorAll('li')].map(item => item.firstElementChild).find(item => item?.textContent === name)
    expect(option, `no option for ${name}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

// `editing`: the data set whose editor is open. `held`: the recipes the session holds, by default all of them.
async function open(type, TrainingDataSet, {reused = PROVIDER, editing: dataSetId = REUSED_ID, providerImages, savedName, held} = {}) {
    const records = recipesOf(type, {reused, providerImages, savedName})
    stored.records = Object.fromEntries(records.map(record => [record.id, record]))
    editing.dataSetId = dataSetId
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.filter(({id}) => !held || held.includes(id)).map(record => [record.id, record])),
            recipes: listing(),
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: CONSUMER}],
            selectedTabId: CONSUMER
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
                        <Recipe id={CONSUMER}>
                            <TrainingDataSet dataCollectionManager={{updateAll: () => {}}}/>
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
