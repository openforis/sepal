import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {initStore} from '~/store'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// What a recipe's toolbar marks while its wizard sets it up: a section the wizard has not reached is not marked yet, one
// it has reached is marked as usual - as wrong, or as unfinished - and once the wizard is done every section is, as far
// as its type marks it, with Classification's collection button marked as its Training data is unfinished. Only the marks wait - what holds the
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

// No training data at all is set-up not yet done: Training data is marked as unfinished, saying how to add some, once
// the wizard reaches it - its button not saying it while its panel is open.
describe('a Regression without training data', () => {
    it('marks Training data as unfinished once the wizard reaches it and once it is done, and is held back all the same', async () => {
        await open(regressionOf(), RegressionToolbar)
        expect(unfinished()).toEqual({})

        await click(button('wizard.next'))
        expect(openPanels()).toEqual(['trainingData'])
        expect(unfinished()).toEqual({[TRAINING_DATA]: null})
        await click(button('wizard.done'))

        expect(unfinished()).toEqual({[TRAINING_DATA]: [MISSING_REGRESSION]})
        expect(markedSections()).toEqual({})
        expect(findings()).toEqual(['NO_TRAINING_DATA'])
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: TRAINING_DATA})
    })

    it('marks Training data as unfinished once set up', async () => {
        await open(regressionOf({initialized: true}), RegressionToolbar)

        expect(unfinished()).toEqual({[TRAINING_DATA]: [MISSING_REGRESSION]})
        expect(retrieveAvailable()).toBe(false)
    })

    it('is complete once a data set stores a point, and unfinished again once it stores none', async () => {
        await open(regressionOf({initialized: true}), RegressionToolbar)

        await setDataSets([PLOTS])
        expect(unfinished()).toEqual({})
        expect(markedSections()).toEqual({})

        await setDataSets([])
        expect(unfinished()).toEqual({[TRAINING_DATA]: [MISSING_REGRESSION]})
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

    it('marks the input imagery wrong once the wizard is done, and Training data and the collection button unfinished', async () => {
        await open(classificationOf({included: ['red', 'elevation']}), ClassificationToolbar)
        expect(unfinished()).toEqual({})

        await click(button('wizard.next'))
        expect(unfinished()).toEqual({})
        await click(button('wizard.done'))

        expect(markedSections()).toEqual({[INPUT_IMAGERY]: [UNAVAILABLE_SELECTIONS]})
        expect(unfinished()).toEqual({[TRAINING_DATA]: [MISSING_CLASSIFICATION], [COLLECT]: [MISSING_CLASSIFICATION]})
    })
})

describe('a Classification without training data alone, once its wizard is done', () => {
    it('marks Training data and the collection button unfinished, saying how to add some, and cannot run, its previews held naming Training data', async () => {
        await open(classificationOf(), ClassificationToolbar)

        await click(button('wizard.next'))
        await click(button('wizard.done'))

        expect(unfinished()).toEqual({[TRAINING_DATA]: [MISSING_CLASSIFICATION], [COLLECT]: [MISSING_CLASSIFICATION]})
        expect(markedSections()).toEqual({})
        expect(findings()).toEqual(['NO_TRAINING_DATA'])
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: TRAINING_DATA})
    })

    it('marks Training data wrong for what a data set is found to lack beside it, and neither it nor the collection button unfinished', async () => {
        await open(classificationOf({dataSetName: ''}), ClassificationToolbar)

        await click(button('wizard.next'))
        await click(button('wizard.done'))

        expect(markedSections()).toEqual({[TRAINING_DATA]: [UNNAMED]})
        expect(unfinished()).toEqual({})
        expect(retrieveAvailable()).toBe(false)
    })
})

describe('a Classification set up without training data', () => {
    it('is complete, Training data and the collection button alike, once a point of each class is collected, and unfinished again once none is left', async () => {
        await open(classificationOf({initialized: true}), ClassificationToolbar)

        await setDataSets([collected(1, 2)])
        expect(unfinished()).toEqual({})
        expect(retrieveAvailable()).toBe(true)

        await setDataSets([])
        expect(unfinished()).toEqual({[TRAINING_DATA]: [MISSING_CLASSIFICATION], [COLLECT]: [MISSING_CLASSIFICATION]})
    })

    it('leaves the collection button unmarked while points are being collected, Training data still unfinished', async () => {
        await open(classificationOf({initialized: true}), ClassificationToolbar)

        await act(async () => actionBuilder('COLLECTING').set(['process.loadedRecipes', ID, 'ui.collect.collecting'], true).dispatch())
        await settled()

        expect(unfinished()).toEqual({[TRAINING_DATA]: [MISSING_CLASSIFICATION]})
    })

    it('marks neither where its classifier is a supplied decision tree, which trains on nothing, and can run', async () => {
        await open(classificationOf({initialized: true, classifier: {type: 'DECISION_TREE', decisionTree: '1) root 9 0 0 (0 1) *'}}), ClassificationToolbar)

        expect(unfinished()).toEqual({})
        expect(markedSections()).toEqual({})
        expect(retrieveAvailable()).toBe(true)
    })
})

// Training points its classifier cannot train on are set-up still to do as well, said naming the classes concerned: all
// its data sets' points judged together, whatever the map last counted of each class, by what the classifier needs.
describe('a Classification set up with training points its classifier cannot train on', () => {
    it('marks Training data and the collection button unfinished for points of one class, naming it, and cannot run, its previews held', async () => {
        await open(classificationOf({initialized: true}), ClassificationToolbar)

        await setDataSets([collected(1, 1)])

        expect(unfinished()).toEqual(marking(insufficient('MINIMUM_CLASSES', {classes: 'Forest', minimum: 2})))
        expect(markedSections()).toEqual({})
        expect(findings()).toEqual(['INSUFFICIENT_TRAINING_SAMPLES'])
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: TRAINING_DATA})
    })

    it('is complete once a point of another class is in any data set, and unfinished again once it is gone', async () => {
        await open(classificationOf({initialized: true}), ClassificationToolbar)

        await setDataSets([collected(1), uploaded(2)])
        expect(unfinished()).toEqual({})
        expect(retrieveAvailable()).toBe(true)
        expect(previewGate()).toBeNull()

        await setDataSets([collected(1), uploaded()])
        expect(unfinished()).toEqual(marking(insufficient('MINIMUM_CLASSES', {classes: 'Forest', minimum: 2})))
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true})
    })

    it('is complete with points of two classes, though a third legend class has none', async () => {
        await open(classificationOf({initialized: true, legend: THREE_CLASSES}), ClassificationToolbar)

        await setDataSets([collected(1, 2)])

        expect(unfinished()).toEqual({})
        expect(retrieveAvailable()).toBe(true)
    })

    it('is complete once its classifier trains on points of one class, and unfinished again once it does not', async () => {
        await open(classificationOf({initialized: true}), ClassificationToolbar)
        await setDataSets([collected(1, 1)])

        await setClassifier({type: 'SVM', svmType: 'C_SVC'})
        expect(unfinished()).toEqual({})
        expect(retrieveAvailable()).toBe(true)
        expect(previewGate()).toBeNull()

        await setClassifier({type: 'NAIVE_BAYES'})
        expect(unfinished()).toEqual(marking(insufficient('MINIMUM_CLASSES', {classes: 'Forest', minimum: 2})))
        expect(retrieveAvailable()).toBe(false)
    })

    it('is judged by its points alone, whatever the map last counted of each class', async () => {
        await open(classificationOf({initialized: true}), ClassificationToolbar)

        await setDataSets([collected(1, 2)])
        await setCountPerClass({1: 1})
        expect(unfinished()).toEqual({})
        expect(retrieveAvailable()).toBe(true)
        expect(previewGate()).toBeNull()

        await setDataSets([collected(1)])
        await setCountPerClass({1: 1, 2: 1})
        expect(unfinished()).toEqual(marking(insufficient('MINIMUM_CLASSES', {classes: 'Forest', minimum: 2})))
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true})
    })

    it.each([
        ['is complete with points of the class it is configured with alone', {oneClass: 1}, {}],
        ['names the class it is configured with while no point is of it', {oneClass: 2}, marking(insufficient('TRAINED_CLASS', {classes: 'Water'}))],
        ['names class 0, which it trains on configured with none, by its value', {}, marking(insufficient('TRAINED_CLASS', {classes: '0'}))]
    ])('by a one-class SVM %s', async (_case, settings, expected) => {
        await open(classificationOf({initialized: true, classifier: {type: 'SVM', svmType: 'ONE_CLASS', ...settings}}), ClassificationToolbar)

        await setDataSets([collected(1)])

        expect(unfinished()).toEqual(expected)
        expect(retrieveAvailable()).toBe(!Object.keys(expected).length)
    })

    it.each([
        ['names its classes while none has two points', [1, 2], marking(insufficient('MINIMUM_CLASS_SAMPLES', {classes: 'Forest, Water', minimum: 2}))],
        ['is complete with a class of one point beside two of another, which masking can take away', [1, 2, 2], {}]
    ])('by Mahalanobis minimum distance %s', async (_case, classes, expected) => {
        await open(classificationOf({initialized: true, classifier: {type: 'MINIMUM_DISTANCE', metric: 'mahalanobis'}}), ClassificationToolbar)

        await setDataSets([collected(...classes)])

        expect(unfinished()).toEqual(expected)
        expect(retrieveAvailable()).toBe(!Object.keys(expected).length)
    })
})

// What Input imagery says while it lists no image: nothing while the wizard has it open, being filled - its panel holds
// Next meanwhile - and, as set-up still to do, that one is needed once it has moved on, or for a recipe already set up.
// What holds the recipe back holds it all along.
describe('an empty Input imagery', () => {
    it.each(TOOLBARS)('of a %s is not marked while the wizard has it open, and holds the recipe back', async (_type, toolbar) => {
        await open(toolbar.recipe({initialized: false}), toolbar.Toolbar)

        expect(openPanels()).toEqual(['inputImagery'])
        expect(markedSections()).toEqual({})
        expect(unfinished()).toEqual({})
        expect(findings()).toContain('MISSING_ROLE')
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true})
    })

    it.each(TOOLBARS)('of a %s is marked unfinished, saying to add an image, once the wizard is done, beside what else is left to set up', async (_type, toolbar) => {
        await open(toolbar.recipe({initialized: false}), toolbar.Toolbar)

        await finishWizard()

        expect(unfinished()).toEqual({[toolbar.imagery]: [NO_IMAGERY], ...toolbar.unfinished})
        expect(markedSections()).toEqual({})
        expect(retrieveAvailable()).toBe(false)
    })

    it.each(TOOLBARS)('of a %s already set up is marked unfinished at once', async (_type, toolbar) => {
        await open(toolbar.recipe({initialized: true}), toolbar.Toolbar)

        expect(unfinished()[toolbar.imagery]).toEqual([NO_IMAGERY])
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
const MISSING_CLASSIFICATION = 'process.classification.panel.trainingData.missing'
const MISSING_REGRESSION = 'process.regression.panel.trainingData.missing'
// Classification's collection button, which shows only its icon.
const COLLECT = 'collect'

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

// Plots uploaded, of a value each, under no name, and under one.
const UNNAMED_PLOTS = {dataSetId: 'plots', name: '', type: 'CSV_UPLOAD', referenceData: [{x: 1, y: 1, value: 10}, {x: 2, y: 2, value: 20}]}
const PLOTS = {...UNNAMED_PLOTS, name: 'Plots'}

const FOREST = {id: 'forest', value: 1, label: 'Forest', color: '#006400'}
const WATER = {id: 'water', value: 2, label: 'Water', color: '#0000ff'}
const THREE_CLASSES = [FOREST, WATER, {id: 'bare', value: 3, label: 'Bare', color: '#999999'}]

// What the training points lack of what the classifier needs, as Training data and the collection button both say it.
const insufficient = (need, values) => `process.classification.panel.trainingData.insufficient.${need} ${JSON.stringify(values)}`
const marking = message => ({[TRAINING_DATA]: [message], [COLLECT]: [message]})

// A point of each of these classes, in turn, collected on the map, or uploaded.
const collected = (...classes) => ({dataSetId: 'collected', name: 'Collected', type: 'COLLECTED', referenceData: classes.map(pointOf)})
const uploaded = (...classes) => ({dataSetId: 'uploaded', name: 'Uploaded', type: 'CSV_UPLOAD', referenceData: classes.map(pointOf)})
const pointOf = (value, i) => ({x: i, y: value, class: value})

const regressionOf = ({initialized = false, dataSets = []} = {}) => ({
    id: ID, type: 'REGRESSION', revision: 1, ui: {initialized},
    model: {
        inputImagery: {images: [compositeImage(['red', 'nir', 'swir1'])]},
        trainingData: {dataSets},
        auxiliaryImagery: [],
        classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25}
    }
})

const classificationOf = ({included = ['red', 'nir'], dataSetName = 'Collected', initialized = false, legend = [FOREST, WATER], classifier = {type: 'RANDOM_FOREST', numberOfTrees: 25}} = {}) => ({
    id: ID, type: 'CLASSIFICATION', revision: 1, ui: {initialized},
    model: {
        inputImagery: {images: [compositeImage(included)]},
        legend: {entries: legend},
        trainingData: {dataSets: [{dataSetId: 'collected', name: dataSetName, type: 'COLLECTED', referenceData: []}]},
        auxiliaryImagery: [],
        classifier
    }
})

const emptyImagery = (recipe, initialized) =>
    ({...recipe, ui: {initialized}, model: {...recipe.model, inputImagery: {images: []}}})

// Each toolbar, over a recipe of its type listing no input image, the label of its Input imagery button, and what else
// it marks as unfinished once set up.
const TOOLBARS = [
    ['Classification', {
        Toolbar: ClassificationToolbar, imagery: INPUT_IMAGERY,
        unfinished: {[TRAINING_DATA]: [MISSING_CLASSIFICATION], [COLLECT]: [MISSING_CLASSIFICATION]},
        recipe: ({initialized}) => emptyImagery(classificationOf(), initialized)
    }],
    ['Regression', {
        Toolbar: RegressionToolbar, imagery: INPUT_IMAGERY,
        unfinished: {[TRAINING_DATA]: [MISSING_REGRESSION]},
        recipe: ({initialized}) => emptyImagery(regressionOf(), initialized)
    }],
    ['Band Math', {
        Toolbar: BandMathToolbar, imagery: IMAGERY,
        // Its Output bands, empty, waits on there being an input to output.
        unfinished: {},
        recipe: ({initialized}) => emptyImagery({
            id: ID, type: 'BAND_MATH', revision: 1,
            model: {calculations: {calculations: []}, outputBands: {outputImages: []}}
        }, initialized)
    }],
    ['Remapping', {
        Toolbar: RemappingToolbar, imagery: IMAGERY,
        unfinished: {},
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

// The buttons marked as unfinished, as markedSections.
const unfinished = () => Object.fromEntries([...document.querySelectorAll('button')]
    .filter(button => button.classList.contains(toolbarButtonStyles.warning))
    .map(button => [button.textContent || (button.querySelector('[data-icon="location-pin"]') ? COLLECT : null), tooltipOf(button)]))

// The recipe's data sets as a Training data Apply would leave them.
const setDataSets = async dataSets => {
    await act(async () => actionBuilder('SET_DATA_SETS').set(['process.loadedRecipes', ID, 'model.trainingData.dataSets'], dataSets).dispatch())
    await settled()
}

// The classifier as the Classifier panel's Apply leaves it.
const setClassifier = async classifier => {
    await act(async () => actionBuilder('SET_CLASSIFIER').set(['process.loadedRecipes', ID, 'model.classifier'], classifier).dispatch())
    await settled()
}

// What the map's collection last counted of each class, as it sets it.
const setCountPerClass = async countPerClass => {
    await act(async () => actionBuilder('SET_COUNT_PER_CLASS').set(['process.loadedRecipes', ID, 'ui.collect.countPerClass'], countPerClass).dispatch())
    await settled()
}

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
