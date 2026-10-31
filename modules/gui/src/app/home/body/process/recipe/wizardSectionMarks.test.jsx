import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// What a recipe's toolbar marks while its wizard sets it up: a section the wizard has not reached is not marked yet, one
// it has reached is marked as usual, and once the wizard is done every section is - as far as its type marks it. Only the marks wait - what holds the
// recipe back holds it all along. Through the real Classification and Regression toolbars, wizard, activation, section
// buttons and requirement reads over a real store; each panel is a stand-in that opens and closes as its section does,
// offering the wizard's steps.

vi.mock('~/apiRegistry', async () => {
    const {NEVER} = await import('rxjs')
    return {default: {recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => NEVER}, gee: {}}}
})
vi.mock('~/translate', () => ({msg: (key, values) => {
    const name = Array.isArray(key) ? key.join('.') : key
    return values ? `${name} ${JSON.stringify(values)}` : name
}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
// A panel opened by its section, held open while the wizard leads, offering its steps.
const stub = vi.hoisted(() => ({
    panel: async id => {
        const {compose} = await import('~/compose')
        const {withActivatable} = await import('~/widget/activation/activatable')
        const {withPanelWizard} = await import('~/widget/panelWizard')
        const Panel = ({panelWizard}) =>
            <section data-panel={id}>
                {panelWizard?.wizard && panelWizard.back && <button onClick={panelWizard.back}>wizard.back</button>}
                {panelWizard?.wizard && panelWizard.next && <button onClick={panelWizard.next}>wizard.next</button>}
                {panelWizard?.wizard && !panelWizard.next && <button onClick={panelWizard.done}>wizard.done</button>}
            </section>
        return compose(
            Panel,
            withActivatable({id, policy: ({panelWizard}) => panelWizard?.wizard ? {_: 'disallow'} : {_: 'allow-then-deactivate'}}),
            withPanelWizard()
        )
    }
}))
vi.mock('~/app/home/body/process/panels/inputImageryWithDerived/inputImagery', async () => ({InputImagery: await stub.panel('inputImagery')}))
vi.mock('~/app/home/body/process/recipe/classification/legend/legend', async () => ({Legend: await stub.panel('legend')}))
vi.mock('~/app/home/body/process/recipe/classification/panels/trainingData/trainingData', async () => ({TrainingData: await stub.panel('trainingData')}))
vi.mock('~/app/home/body/process/recipe/classification/panels/auxiliaryImagery/auxiliaryImagery', async () => ({AuxiliaryImagery: await stub.panel('auxiliaryImagery')}))
vi.mock('~/app/home/body/process/recipe/classification/panels/classifier/classifier', async () => ({Classifier: await stub.panel('classifier')}))
vi.mock('~/app/home/body/process/recipe/classification/panels/retrieve/retrieve', () => ({Retrieve: () => null}))
vi.mock('~/app/home/body/process/recipe/regression/panels/trainingData/trainingData', async () => ({TrainingData: await stub.panel('trainingData')}))
vi.mock('~/app/home/body/process/recipe/regression/panels/classifier/classifier', async () => ({Classifier: await stub.panel('classifier')}))
vi.mock('~/app/home/body/process/recipe/regression/panels/retrieve/retrieve', () => ({Retrieve: () => null}))
vi.mock('~/app/home/body/process/panels/inputImagery/inputImagery', async () => ({InputImagery: await stub.panel('inputImagery')}))
vi.mock('~/app/home/body/process/panels/mapping/mapping', async () => ({Mapping: await stub.panel('mapping')}))
vi.mock('~/app/home/body/process/recipe/remapping/legend/legend', async () => ({Legend: await stub.panel('legend')}))
vi.mock('~/app/home/body/process/recipe/remapping/panels/retrieve/retrieve', () => ({Retrieve: () => null}))
vi.mock('~/app/home/body/process/recipe/bandMath/panels/inputImagery/inputImagery', async () => ({InputImagery: await stub.panel('inputImagery')}))
vi.mock('~/app/home/body/process/recipe/bandMath/panels/calculations/calculations', async () => ({Calculations: await stub.panel('calculations')}))
vi.mock('~/app/home/body/process/recipe/bandMath/panels/outputBands/outputBands', async () => ({OutputBands: await stub.panel('outputBands')}))
vi.mock('~/app/home/body/process/recipe/bandMath/panels/retrieve/retrieve', () => ({Retrieve: () => null}))
vi.mock('~/app/home/body/process/recipe/retrieveButton', () => ({RetrieveButton: () => null}))
// The recipes whose requirements are read, in the order they are read.
const requirementReads = vi.hoisted(() => ({recipeIds: []}))
vi.mock('~/app/home/body/process/recipe/sourceRequirements', async importOriginal => {
    const original = await importOriginal()
    return {...original, readSourceRequirements: (...args) => {
        requirementReads.recipeIds.push(args[0].recipe.id)
        return original.readSourceRequirements(...args)
    }}
})

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: classification} = await import('./classification/classification')
const {default: regression} = await import('./regression/regression')
const {ClassificationToolbar} = await import('./classification/panels/classificationToolbar')
const {RegressionToolbar} = await import('./regression/panels/regressionToolbar')
const {default: bandMath} = await import('./bandMath/bandMath')
const {default: remapping} = await import('./remapping/remapping')
const {BandMathToolbar} = await import('./bandMath/panels/bandMathToolbar')
const {RemappingToolbar} = await import('./remapping/panels/remappingToolbar')
const {Recipe} = await import('~/app/home/body/process/recipeContext')
const {retrieveAvailability} = await import('./operationAvailability')
const {readRetrieveOutput} = await import('./retrieveOutput')
const {TRAINING_DATA: TRAINING_DATA_SECTION} = await import('./classification/trainingDataRequirements')
const {SUPPORTED, unsupported} = await import('#sepal/recipe/requirement/verdict')
const {requestGate} = await import('./sourceRequirements')
const {sectionProblemsOfState, sourceProblemsOfState} = await import('./selectedSourceStatus')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {PanelWizard} = await import('~/widget/panelWizard')
const {Toolbar} = await import('~/widget/toolbar/toolbar')
const {SectionButton} = await import('./sectionButton')
const {sliceRequirements} = await import('./ccdcSlice/sourceRequirement')

// Stands in for a problem found in a training data set a Classification or Regression configures - they declare none
// today: a data set without a name.
const UNNAMED_DATA_SET = {
    id: 'test.unnamedDataSet',
    section: TRAINING_DATA_SECTION,
    requirement: {
        id: 'test.unnamedDataSet',
        evaluate: ({unnamed}) => unnamed ? unsupported({code: 'UNNAMED_DATA_SET'}) : {status: SUPPORTED},
        describe: () => ({message: 'Name each training data set', details: []})
    },
    localFacts: recipe => ({unnamed: recipe.model.trainingData.dataSets.some(({name}) => !name)}),
    operations: ['IMAGE_OUTPUT']
}

addRecipeType({...classification(), sourceRequirements: [...classification().sourceRequirements, UNNAMED_DATA_SET]})
addRecipeType({...regression(), sourceRequirements: [...regression().sourceRequirements, UNNAMED_DATA_SET]})
addRecipeType({id: 'CCDC_SLICE', imageSource: true, sourceRequirements: sliceRequirements})
addRecipeType(bandMath())
addRecipeType(remapping())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

// No training data at all is set-up not yet done, which Training data's own panel guides: its button is not marked for it.
describe('a Regression without training data', () => {
    it('leaves Training data unmarked through its wizard and once it is done, and is held back all the same', async () => {
        await open(regressionOf(), RegressionToolbar)
        expect(markedSections()).toEqual({})

        await click(button('wizard.next'))
        expect(openPanels()).toEqual(['trainingData'])
        expect(markedSections()).toEqual({})
        await click(button('wizard.done'))

        expect(markedSections()).toEqual({})
        expect(sectionProblems()).toEqual({})
        expect(findings()).toEqual(['NO_TRAINING_DATA'])
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: TRAINING_DATA})
    })

    it('leaves Training data unmarked once set up', async () => {
        await open(regressionOf({initialized: true}), RegressionToolbar)

        expect(markedSections()).toEqual({})
        expect(retrieveAvailable()).toBe(false)
    })
})

describe('a Regression whose data set is found to lack something, being set up', () => {
    it('leaves Training data unmarked while the wizard is at Input imagery, and is held back all the same', async () => {
        await open(regressionOf({dataSets: [UNNAMED_PLOTS]}), RegressionToolbar)

        expect(openPanels()).toEqual(['inputImagery'])
        expect(markedSections()).toEqual({})
        expect(sectionProblems()).toEqual({trainingData: UNNAMED})
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true})
    })

    it('marks Training data once the wizard reaches it, and keeps it marked going back', async () => {
        await open(regressionOf({dataSets: [UNNAMED_PLOTS]}), RegressionToolbar)

        await click(button('wizard.next'))
        expect(openPanels()).toEqual(['trainingData'])
        expect(markedSections()).toEqual({[TRAINING_DATA]: null})
        await click(button('wizard.back'))

        expect(markedSections()).toEqual({[TRAINING_DATA]: null})
    })

    it('marks Training data once the wizard is done', async () => {
        await open(regressionOf({dataSets: [UNNAMED_PLOTS]}), RegressionToolbar)

        await click(button('wizard.next'))
        await click(button('wizard.done'))

        expect(openPanels()).toEqual([])
        expect(markedSections()).toEqual({[TRAINING_DATA]: [UNNAMED]})
    })

    it('already set up, marks Training data at once', async () => {
        await open(regressionOf({initialized: true, dataSets: [UNNAMED_PLOTS]}), RegressionToolbar)

        expect(markedSections()).toEqual({[TRAINING_DATA]: [UNNAMED]})
    })
})

// Training data is no step of Classification's wizard, and its Training data button never says it has no training data
// at all: what that holds back says so instead. What else its training data sets are found to lack, it does say.
describe('a Classification without training data, an input selecting a band its mosaic lacks, being set up', () => {
    it('marks the input imagery the wizard is at, and is held back all the same', async () => {
        await open(classificationOf({included: ['red', 'elevation']}), ClassificationToolbar)

        expect(openPanels()).toEqual(['inputImagery'])
        expect(markedSections()).toEqual({[INPUT_IMAGERY]: null})
        expect(findings()).toContain('NO_TRAINING_DATA')
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true})
    })

    it('marks nothing more at the Legend', async () => {
        await open(classificationOf({included: ['red', 'elevation']}), ClassificationToolbar)

        await click(button('wizard.next'))

        expect(openPanels()).toEqual(['legend'])
        expect(markedSections()).toEqual({[INPUT_IMAGERY]: null})
    })

    it('marks the input imagery once the wizard is done, and not Training data', async () => {
        await open(classificationOf({included: ['red', 'elevation']}), ClassificationToolbar)

        await click(button('wizard.next'))
        await click(button('wizard.done'))

        expect(markedSections()).toEqual({[INPUT_IMAGERY]: [UNAVAILABLE_SELECTIONS]})
    })
})

describe('a Classification without training data alone, once its wizard is done', () => {
    it('leaves Training data unmarked, and cannot run, its previews held naming Training data', async () => {
        await open(classificationOf(), ClassificationToolbar)

        await click(button('wizard.next'))
        await click(button('wizard.done'))

        expect(markedSections()).toEqual({})
        expect(findings()).toEqual(['NO_TRAINING_DATA'])
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: TRAINING_DATA})
    })

    it('marks Training data for what a data set is found to lack beside it', async () => {
        await open(classificationOf({dataSetName: ''}), ClassificationToolbar)

        await click(button('wizard.next'))
        await click(button('wizard.done'))

        expect(markedSections()).toEqual({[TRAINING_DATA]: [UNNAMED]})
        expect(retrieveAvailable()).toBe(false)
    })
})

// What Input imagery says while it lists no image: nothing while the wizard has it open, being filled - its form holds
// Next meanwhile - and that one is needed once it has moved on, or for a recipe already set up. What holds the recipe
// back holds it all along.
describe('an empty Input imagery', () => {
    it.each(TOOLBARS)('of a %s is not marked while the wizard has it open, and holds the recipe back', async (_type, toolbar) => {
        await open(toolbar.recipe({initialized: false}), toolbar.Toolbar)

        expect(openPanels()).toEqual(['inputImagery'])
        expect(markedSections()).toEqual({})
        expect(findings()).toContain('MISSING_ROLE')
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true})
    })

    it.each(TOOLBARS)('of a %s is marked, saying to add an image, once the wizard is done', async (_type, toolbar) => {
        await open(toolbar.recipe({initialized: false}), toolbar.Toolbar)

        await finishWizard()

        expect(markedSections()[toolbar.imagery]).toEqual([NO_IMAGERY])
        expect(retrieveAvailable()).toBe(false)
    })

    it.each(TOOLBARS)('of a %s already set up is marked at once', async (_type, toolbar) => {
        await open(toolbar.recipe({initialized: true}), toolbar.Toolbar)

        expect(markedSections()[toolbar.imagery]).toEqual([NO_IMAGERY])
    })
})

// What the toolbar says is read from the recipe's requirements once each time the store notifies it, whatever the wizard
// leaves unsaid - here over requirements that read their source's evidence, which are read anew each time.
describe('a section button over requirements reading source evidence, while the wizard leads', () => {
    it('reads the recipe\'s requirements once each time the store notifies it', async () => {
        await open(SLICE, SliceSection)
        const before = readsOf(SLICE.id)

        await act(async () => store.dispatch({type: 'NOTIFY', reduce: state => ({...state})}))

        expect(readsOf(SLICE.id) - before).toBe(1)
    })

    it('says the same at the wizard\'s step as elsewhere, nothing of its requirements waiting for the wizard', async () => {
        await open(SLICE, SliceSection)

        const {sourceProblems, wizardStepProblems} = sectionProblemsOfState(store.getState(), SLICE.id, () => null, Date.now(), heldFor)

        expect(wizardStepProblems).toBe(sourceProblems)
    })
})

const ID = 'recipe-1'
const TRAINING_DATA = 'process.classification.panel.trainingData.button'
const INPUT_IMAGERY = 'process.classification.panel.inputImagery.button'
const UNNAMED = 'Name each training data set'
const NO_IMAGERY = 'process.panels.inputImagery.form.noImagery'
const IMAGERY = 'process.panels.inputImagery.button'
const UNAVAILABLE_SELECTIONS = 'process.classification.panel.inputImagery.unavailableSelections.inputs'

// A Landsat composite, described from its configuration.
const COMPOSITE = {
    id: 'composite-1',
    type: 'MOSAIC',
    revision: 1,
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}

const compositeImage = included => ({
    imageId: 'image-1', type: 'RECIPE_REF', id: COMPOSITE.id,
    bandSetSpecs: [{id: 'image-bands', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included}]
})

// Plots uploaded, of a value each, under no name.
const UNNAMED_PLOTS = {dataSetId: 'plots', name: '', type: 'CSV_UPLOAD', referenceData: [{x: 1, y: 1, value: 10}, {x: 2, y: 2, value: 20}]}

const regressionOf = ({initialized = false, dataSets = []} = {}) => ({
    id: ID, type: 'REGRESSION', revision: 1, ui: {initialized},
    model: {
        inputImagery: {images: [compositeImage(['red', 'nir', 'swir1'])]},
        trainingData: {dataSets},
        auxiliaryImagery: [],
        classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25}
    }
})

const classificationOf = ({included = ['red', 'nir'], dataSetName = 'Collected'} = {}) => ({
    id: ID, type: 'CLASSIFICATION', revision: 1, ui: {initialized: false},
    model: {
        inputImagery: {images: [compositeImage(included)]},
        legend: {entries: [{id: 'forest', value: 1, label: 'Forest', color: '#006400'}, {id: 'water', value: 2, label: 'Water', color: '#0000ff'}]},
        trainingData: {dataSets: [{dataSetId: 'collected', name: dataSetName, type: 'COLLECTED', referenceData: []}]},
        auxiliaryImagery: [],
        classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25}
    }
})

const emptyImagery = (recipe, initialized) =>
    ({...recipe, ui: {initialized}, model: {...recipe.model, inputImagery: {images: []}}})

// Each toolbar, over a recipe of its type listing no input image, and the label of its Input imagery button.
const TOOLBARS = [
    ['Classification', {
        Toolbar: ClassificationToolbar, imagery: INPUT_IMAGERY,
        recipe: ({initialized}) => emptyImagery(classificationOf(), initialized)
    }],
    ['Regression', {
        Toolbar: RegressionToolbar, imagery: INPUT_IMAGERY,
        recipe: ({initialized}) => emptyImagery(regressionOf(), initialized)
    }],
    ['Band Math', {
        Toolbar: BandMathToolbar, imagery: IMAGERY,
        recipe: ({initialized}) => emptyImagery({
            id: ID, type: 'BAND_MATH', revision: 1,
            model: {calculations: {calculations: []}, outputBands: {outputImages: []}}
        }, initialized)
    }],
    ['Remapping', {
        Toolbar: RemappingToolbar, imagery: IMAGERY,
        recipe: ({initialized}) => emptyImagery({
            id: ID, type: 'REMAPPING', revision: 1,
            model: {legend: {entries: [{id: 'l-1', value: 1, label: 'Forest', color: '#006400', constraints: []}]}}
        }, initialized)
    }]
]

// Every step of the wizard taken, then done.
const finishWizard = async () => {
    while (button('wizard.next')) {
        await click(button('wizard.next'))
    }
    await click(button('wizard.done'))
}

// A CCDC Slice of a segments asset, being set up, and its Source button.
const SLICE = {
    id: ID, type: 'CCDC_SLICE', revision: 1, ui: {initialized: false},
    model: {source: {type: 'ASSET', id: 'users/x/segments'}, date: {dateType: 'SINGLE', date: '2020-06-01'}, options: {}}
}

const SliceSection = () =>
    <PanelWizard panels={['source']} initialized={false}>
        <Toolbar vertical placement='bottom-right'>
            <SectionButton id='source' label='process.ccdcSlice.panel.source.button' panel/>
        </Toolbar>
    </PanelWizard>

const readsOf = recipeId => requirementReads.recipeIds.filter(id => id === recipeId).length

async function open(recipe, RecipeToolbar) {
    const initialState = {
        process: {
            loadedRecipes: {[recipe.id]: recipe, [COMPOSITE.id]: COMPOSITE},
            recipes: [{id: recipe.id, name: 'Model', type: recipe.type, revision: 1}, {id: COMPOSITE.id, name: 'Composite', type: 'MOSAIC', revision: 1}],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            folders: [],
            tabs: [{id: recipe.id}]
        },
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <Recipe id={recipe.id}>
                <PortalContainer/>
                <PortalContainer id='panels'/>
                <PortalContext id='panels'>
                    <RecipeToolbar/>
                </PortalContext>
            </Recipe>
        </Provider>
    ))
    await settled()
}

const recipe = () => store.getState().process.loadedRecipes[ID]

// The session answers alone: the recipes here are described from their configuration.
const heldFor = () => null

// What the recipe's requirements say of each section, whatever its toolbar shows.
const sectionProblems = () => sourceProblemsOfState(store.getState(), ID, () => null, Date.now(), heldFor)

// The codes of what keeps the recipe from running.
const findings = () => readRetrieveOutput({state: store.getState(), recipeId: ID, heldFor}).output.readiness.findings.map(({code}) => code)

const retrieveAvailable = () => retrieveAvailability({state: store.getState(), recipe: recipe(), heldFor, now: Date.now()}).available

const previewGate = () => requestGate({state: store.getState(), recipe: recipe(), operation: 'IMAGE_OUTPUT', heldFor, now: Date.now()})

const openPanels = () => [...document.querySelectorAll('[data-panel]')].map(panel => panel.dataset.panel)

// The section buttons in their error state, by label, with what their tooltips say: nothing for the section open, nor,
// while the wizard leads, for another, which cannot be opened meanwhile.
const markedSections = () => Object.fromEntries([...document.querySelectorAll('button')]
    .filter(button => button.classList.contains(toolbarButtonStyles.error))
    .map(button => [button.textContent, tooltipOf(button)]))

const tooltipOf = button => {
    const tooltip = button.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : null
}

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
