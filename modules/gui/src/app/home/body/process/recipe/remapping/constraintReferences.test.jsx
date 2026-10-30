import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {asapScheduler, NEVER, observeOn, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {deserialize, serialize} from '~/serialize'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import errorIndicatorStyles from '~/widget/errorIndicator.module.css'
import listItemStyles from '~/widget/listItem.module.css'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// Remapping constraints reading an input since removed, or a band their input no longer includes, as the editor's real
// toolbar, Mapping panel and constraint modal show them over a real store: marked on the Mapping button, the legend
// entry's row and the constraint's field, Retrieve not offered, never rewritten until repaired and applied. An edit not
// yet applied is judged by the modal alone. Index Change, sharing the constraint editor without asking it to check
// references, judges its constraints as before. Earth Engine answers only what the input asset's image holds, which
// running the Remapping builds.

vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: ({asset, recipe, includeDataTypes}) => {
            if (bandResponses[asset || recipe?.id]) {
                return bandResponses[asset || recipe.id]
            }
            const names = recipe
                ? recipe.type === 'BAND_MATH'
                    ? recipe.model.outputBands.outputImages.flatMap(({outputBands}) => outputBands.map(({outputName, defaultOutputName}) => outputName || defaultOutputName))
                    : ['class']
                : assetBands(asset)
            return of(includeDataTypes || asset ? names.map(name => ({name, arrayDimensions: 0})) : names).pipe(observeOn(asapScheduler))
        },
        // The input editor's picker reads an asset's bands after the asynchronous metadata request answers.
        assetMetadata$: ({asset}) => of({
            type: 'Image', bandNames: assetBands(asset),
            bands: assetBands(asset).map(id => ({id, data_type: {type: 'PixelType', precision: 'float'}})), properties: {}
        }).pipe(observeOn(asapScheduler)),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
    },
    recipe: {save$: () => NEVER, load$: id => of(sourceRecipes[id] || sourceRecipe(id)), loadAll$: () => of([])}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().map(tooltipText).some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().map(tooltipText).filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: remapping} = await import('./remapping')
const {default: bandMath} = await import('../bandMath/bandMath')
const {RemappingToolbar} = await import('./panels/remappingToolbar')
const {default: stack} = await import('../stack/stack')
const {default: classification} = await import('../classification/classification')
const {default: regression} = await import('../regression/regression')
const {default: unsupervised} = await import('../unsupervisedClassification/unsupervisedClassification')
const {InputImagery: SharedInputs} = await import('../../panels/inputImagery/inputImagery')
const {InputImagery: BandMathInputs} = await import('../bandMath/panels/inputImagery/inputImagery')
const {InputImagery: DerivedInputs} = await import('../../panels/inputImageryWithDerived/inputImagery')
const {SectionButton} = await import('../sectionButton')
const {Toolbar} = await import('~/widget/toolbar/toolbar')
const {PanelWizard} = await import('~/widget/panelWizard')
const {default: indexChange} = await import('../indexChange/indexChange')
const {defaultModel: indexChangeModel} = await import('../indexChange/indexChangeRecipe')
const {IndexChangeToolbar} = await import('../indexChange/panels/indexChangeToolbar')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {requestGate} = await import('../sourceRequirements')
const {withSourceProblems} = await import('../selectedSource')
const ProblemProbe = withSourceProblems()(({sourceProblems}) => <div data-upstream-problems={JSON.stringify(tooltipText(sourceProblems))}/>)
const {readImageOutput} = await import('#sepal/recipe/output/readImageOutput')
const {recipeType} = await import('#sepal/recipe/recipeTypeRegistry')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')

addRecipeType(remapping())
addRecipeType(bandMath())
addRecipeType(indexChange())
;[stack, classification, regression, unsupervised].forEach(type => addRecipeType(type()))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime
let sourceBands = {}
let sourceRecipes = {}
let bandResponses = {}

beforeEach(() => {
    sourceBands = {}
    sourceRecipes = {}
    bandResponses = {}
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a reference to a recipe that cannot run', () => {
    it('does not turn pending or temporarily failed upstream evidence into an editor reference error', async () => {
        const bands$ = new Subject()
        bandResponses[OPTICAL] = bands$
        const upstream = {...sourceRecipe('upstream'), title: 'Upstream'}
        upstream.model.legend.entries[0].constraints = [constraintOf('used', 'source-optical', 'nbr', '>', 0)]
        const saved = remappingRecipe([constraintOf('uses-upstream', 'input', 'class', '>', 0)])
        saved.model.inputImagery.images = [inputOf('input', 'upstream', 'class', 'RECIPE_REF')]
        saved.model.legend.entries = saved.model.legend.entries.slice(0, 1)
        await open(saved, <RemappingToolbar/>, [upstream])
        expect(inError(IMAGERY)).toBe(false)
        await press(IMAGERY)
        await click(innermost('Upstream'))
        expect(errorsOf('widget.recipeInput.label')).toEqual([])
        expect(applyEnabled()).toBe(false)
        await act(async () => bands$.error(new Error('Temporary service failure')))
        await settled()
        expect(errorsOf('widget.recipeInput.label')).toEqual([])
        expect(inError(IMAGERY)).toBe(false)
        expect(model()).toEqual(saved.model)
    })

    it.each(['a', 'math', 'both'])('marks only the reference to A, names the origin %s, and clears after repair', async origin => {
        const band = origin === 'math' ? 'class' : 'removed'
        const math = {
            id: 'math', type: 'BAND_MATH', title: 'Band Math', revision: 1, ui: {initialized: true},
            model: {
                inputImagery: {images: [{imageId: 'asset', name: 'i1', type: 'ASSET', id: ASSET,
                    includedBands: [{id: 'class', name: 'class'}]}]},
                calculations: {calculations: origin !== 'a' ? [{
                    imageId: 'calculation', name: 'c1', type: 'EXPRESSION', expression: 'gone.class',
                    usedBands: [], includedBands: [{id: 'calculated', name: 'class'}]
                }] : []},
                outputBands: {outputImages: [{imageId: 'asset', name: 'i1',
                    outputBands: [{id: 'class', name: 'class', defaultOutputName: 'class'}]}]}
            }
        }
        const a = {...remappingRecipe([constraintOf('used', 'math-input', band, '>', 5)]),
            id: 'a', title: 'Remapping A', revision: 1}
        a.model.legend.entries = a.model.legend.entries.slice(0, 1)
        a.model.inputImagery.images = [inputOf('math-input', 'math', band, 'RECIPE_REF')]
        const b = remappingRecipe([constraintOf('uses-a', 'a-input', 'class', '>', 0)])
        b.model.legend.entries = b.model.legend.entries.slice(0, 1)
        // Put the healthy reference first: no attribution by list position or first diagnostic.
        b.model.inputImagery.images = [inputOf('healthy', RADAR, 'class', 'RECIPE_REF'), inputOf('a-input', 'a', 'class', 'RECIPE_REF')]
        const replacement = {...sourceRecipe('replacement'), title: 'Healthy replacement'}
        await open(b, <><RemappingToolbar/><ProblemProbe recipeId='a'/></>, [math, a, replacement])
        expect(retrieveOffered()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true})
        if (origin !== 'both') {
            expect(previewGate()).toMatchObject({read: {refusedBy: origin}})
        }
        expect(JSON.parse(document.querySelector('[data-upstream-problems]').dataset.upstreamProblems))
            .toEqual({inputImagery: origin !== 'a'
                ? 'process.source.status.recipeNeedsAttention {"recipe":"Band Math"}'
                : 'process.panels.inputImagery.unavailableBands.inputs'})
        expect(inError(IMAGERY)).toBe(true)
        expect(inError(MAPPING)).toBe(false)
        await press(IMAGERY)
        const markedRows = () => [...document.getElementsByClassName(classOf(listItemStyles, 'verticalWrapper'))]
            .filter(row => row.querySelector(`.${classOf(errorIndicatorStyles, 'indicator')}`))
        expect(markedRows()).toHaveLength(1)
        expect(markedRows()[0].textContent).toContain('Remapping A')
        const warning = origin === 'both'
            ? 'process.source.status.recipeAlsoDependsOn {"recipe":"Remapping A","origins":"Band Math"}'
            : origin === 'math'
                ? 'process.source.status.recipeBlockedBy {"recipe":"Remapping A","origins":"Band Math"}'
                : 'process.source.status.recipeNeedsAttention {"recipe":"Remapping A"}'
        expect([...markedRows()[0].querySelectorAll('[data-tooltip]')].some(element =>
            JSON.parse(element.dataset.tooltip).includes(warning))).toBe(true)

        await click(innermost('Remapping A'))
        expect(errorsOf('widget.recipeInput.label')).toEqual([warning])
        expect(applyEnabled()).toBe(false)
        expect(model()).toEqual(b.model)
        await choose('widget.recipeInput.label', 'Healthy replacement')
        expect(errorsOf('widget.recipeInput.label')).toEqual([])
        expect(applyEnabled()).toBe(true)
        expect(inError(IMAGERY)).toBe(true)
        expect(retrieveOffered()).toBe(false)
        expect(model()).toEqual(b.model)
        await press('button.cancel')
        expect(inError(IMAGERY)).toBe(true)
        expect(model()).toEqual(b.model)
        await click(innermost('Remapping A'))
        expect(errorsOf('widget.recipeInput.label')).toEqual([warning])
        expect(applyEnabled()).toBe(false)

        if (origin === 'both') {
            // Fixing the calculation alone does not restore the output A reads: its own finding must remain.
            await act(async () => store.dispatch({type: 'REPAIR_CALCULATION_ONLY', reduce: state => ({...state, process: {
                ...state.process, loadedRecipes: {...state.process.loadedRecipes, math: {...math, model: {
                    ...math.model,
                    calculations: {calculations: math.model.calculations.calculations.map(calculation => ({...calculation, expression: 'i1.class'}))}
                }}}
            }})}))
            await settled()
            expect(errorsOf('widget.recipeInput.label')).toEqual(['process.source.status.recipeNeedsAttention {"recipe":"Remapping A"}'])
            expect(inError(IMAGERY)).toBe(true)
            expect(retrieveOffered()).toBe(false)
            expect(previewGate()).toMatchObject({withdraw: true, read: {refusedBy: 'a'}})
            expect(model()).toEqual(b.model)
        }

        // Repair the originating calculation or restore the output name, without editing either constraint.
        await act(async () => store.dispatch({type: 'RESTORE_OUTPUT', reduce: state => ({...state, process: {
            ...state.process, loadedRecipes: {...state.process.loadedRecipes, math: {...math, model: {
                ...math.model,
                calculations: {calculations: math.model.calculations.calculations.map(calculation => ({...calculation, expression: 'i1.class'}))},
                outputBands: {outputImages: [{imageId: 'asset', name: 'i1',
                    outputBands: [{id: 'class', name: 'class', outputName: band, defaultOutputName: 'class'}]}]}
            }}}
        }})}))
        await settled()
        expect(inError(IMAGERY)).toBe(false)
        expect(markedRows()).toEqual([])
        expect(errorsOf('widget.recipeInput.label')).toEqual([])
        expect(applyEnabled()).toBe(false)
        expect(model()).toEqual(b.model)
        expect(JSON.parse(document.querySelector('[data-upstream-problems]').dataset.upstreamProblems)).toEqual({})
        // Closing the selector releases loaded records; reopening reads the repaired saved version.
        sourceRecipes.math = store.getState().process.loadedRecipes.math
        expect(previewGate()).toBeNull()
        await click([...document.querySelectorAll('button')].filter(button => button.textContent === 'button.close').pop())
        expect(retrieveOffered()).toBe(true)
    })
})

// The same declaration binds the other shared input editors, including the derived editor's existing band checks.
describe('upstream feedback across shared input editors', () => {
    it.each([
        ['STACK', SharedInputs],
        ['BAND_MATH', BandMathInputs],
        ['CLASSIFICATION', DerivedInputs],
        ['REGRESSION', DerivedInputs],
        ['UNSUPERVISED_CLASSIFICATION', DerivedInputs]
    ])('%s blocks committing an unusable draft selection, while preserving Close, Cancel, repair and removal', async (type, Inputs) => {
        const upstream = {...sourceRecipe('upstream'), title: 'Broken source'}
        upstream.model.legend.entries[0].constraints = [constraintOf('broken', 'removed', 'class', '>', 0)]
        const replacement = {...sourceRecipe('replacement'), title: 'Healthy replacement'}
        const otherBroken = {...upstream, id: 'other-broken', title: 'Other broken source'}
        const image = {
            ...inputOf('input', 'upstream', 'class', 'RECIPE_REF'), name: 'i1', bands: Inputs === DerivedInputs ? ['class'] : {class: {}},
            includedBands: [{id: 'class', name: 'class', band: 'class', type: 'continuous', legendEntries: []}],
            bandSetSpecs: [{id: 'bands', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['class']}]
        }
        const saved = {
            id: 'remapping-1', type,
            model: {
                inputImagery: {images: [image]},
                calculations: {calculations: []},
                outputBands: {outputImages: [{imageId: 'input', name: 'i1', outputBands: [{id: 'class', name: 'class', defaultOutputName: 'class'}]}]},
                trainingData: {dataSets: []}, legend: {entries: []}, classifier: {type: 'RANDOM_FOREST'},
                clusterer: {type: 'KMEANS', numberOfClusters: 5}
            }
        }
        await open(saved, <PanelWizard panels={['inputImagery']} initialized><Inputs/><Toolbar><SectionButton id='inputImagery' label={IMAGERY} panel/></Toolbar></PanelWizard>, [upstream, otherBroken, replacement])
        expect(inError(IMAGERY)).toBe(true)
        await press(IMAGERY)
        await click(innermost('Broken source'))
        expect(errorsOf('widget.recipeInput.label')).toEqual(['process.source.status.recipeNeedsAttention {"recipe":"Broken source"}'])
        expect(applyEnabled()).toBe(false)
        expect(model()).toEqual(saved.model)
        // An unchanged invalid editor can still close. A changed unusable selection must refuse the actual form submit.
        await press('button.close')
        await click(innermost('Broken source'))
        await choose('widget.recipeInput.label', 'Other broken source')
        expect(button('button.apply').disabled).toBe(true)
        await click(document.querySelector('form').querySelector('[type="submit"]'))
        await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})))
        expect(model()).toEqual(saved.model)
        await act(async () => store.dispatch({type: 'REPAIR_DRAFT_SOURCE', reduce: state => ({...state, process: {
            ...state.process, loadedRecipes: {...state.process.loadedRecipes,
                'other-broken': {...state.process.loadedRecipes['other-broken'], model: {...otherBroken.model, legend: {...otherBroken.model.legend,
                    entries: otherBroken.model.legend.entries.map(entry => ({...entry, constraints: []}))}}}}
        }})}))
        await settled()
        expect(errorsOf('widget.recipeInput.label')).toEqual([])
        expect(applyEnabled()).toBe(true)
        await press('button.cancel')
        expect(model()).toEqual(saved.model)
        await click(innermost('Broken source'))
        await choose('widget.recipeInput.label', 'Healthy replacement')
        expect(errorsOf('widget.recipeInput.label')).toEqual([])
        expect(applyEnabled()).toBe(true)
        expect(inError(IMAGERY)).toBe(true)
        await press('button.apply')
        expect(model().inputImagery.images[0].id).toBe('replacement')
        await removeInput('Healthy replacement')
        expect(model().inputImagery.images).toEqual([])
    })
})

describe('a constraint whose included band is missing from its source', () => {
    const saved = () => {
        const recipe = remappingRecipe([constraintOf('used', 'i-1', 'missing', '>', 5)])
        recipe.model.inputImagery.images[0].includedBands.push({id: 'missing', band: 'missing', type: 'continuous'})
        return recipe
    }

    it('marks IMG and the input row, explains the constraint, and isolates a cancelled or applied repair', async () => {
        const recipe = saved()
        await open(recipe, <RemappingToolbar/>)
        expect(inError(IMAGERY)).toBe(true)
        expect(inError(MAPPING)).toBe(false)
        expect(retrieveOffered()).toBe(false)
        expect(previewGate()).toMatchObject({code: 'CONFIGURATION_UNMET', section: IMAGERY})
        await press(IMAGERY)
        const inputRow = [...document.getElementsByClassName(classOf(listItemStyles, 'verticalWrapper'))]
            .find(row => row.textContent.includes(ASSET))
        expect(inputRow.querySelector(`.${classOf(errorIndicatorStyles, 'indicator')}`)).not.toBeNull()
        await click(innermost(ASSET))
        expect(applyEnabled()).toBe(false)
        expect([...document.querySelectorAll('[data-tooltip]')].some(element =>
            element.dataset.tooltip.includes('missingBands') && element.dataset.tooltip.includes('missing'))).toBe(true)
        await click([...document.querySelectorAll('button')].filter(button => button.textContent.includes('button.close')).at(-1))
        await press(MAPPING)
        expect(rowsInError()).toEqual([])
        await openEntry('Forest')
        expect(applyEnabled()).toBe(false)
        expect(model()).toEqual(recipe.model)
        await expand('missing > 5')
        expect(errorsOf(BAND)).toEqual([expect.stringContaining('sourceBandMissing')])
        await choose(BAND, 'class')
        expect(applyEnabled()).toBe(true)
        expect(retrieveOffered()).toBe(false)
        await press('button.cancel')
        expect(model()).toEqual(recipe.model)
        await openEntry('Forest')
        await expand('missing > 5')
        await choose(BAND, 'class')
        await press('button.apply')
        expect(inError(IMAGERY)).toBe(false)
        expect(retrieveOffered()).toBe(true)
        expect(previewGate()).toBeNull()
    })

    it('recovers on refreshing restored evidence, without editing the constraint, including an open modal', async () => {
        const recipe = saved()
        await openForest(recipe)
        expect(applyEnabled()).toBe(false)
        sourceBands[ASSET] = ['class', 'missing']
        await act(async () => runtime.refreshAsset(ASSET))
        await settled()
        expect(applyEnabled()).toBe(true)
        expect(inError(IMAGERY)).toBe(false)
        expect(retrieveOffered()).toBe(true)
        expect(previewGate()).toBeNull()
        expect(model()).toEqual(recipe.model)
    })

    it('does not block an unused missing selection, but checks it if selected in a draft', async () => {
        const recipe = saved()
        recipe.model.legend.entries[0].constraints[0].band = 'class'
        recipe.model.legend.entries[0].constraints[0].description = 'class > 5'
        await openForest(recipe)
        expect(retrieveOffered()).toBe(true)
        await expand('class > 5')
        await choose(BAND, 'missing')
        expect(applyEnabled()).toBe(false)
        expect(errorsOf(BAND)).toEqual([expect.stringContaining('sourceBandMissing')])
        expect(retrieveOffered()).toBe(true)
        await press('button.cancel')
        expect(model()).toEqual(recipe.model)
    })

    it('allows a valid repair while another entry still reads the missing source band', async () => {
        const recipe = saved()
        recipe.model.legend.entries[1].constraints = [constraintOf('other', 'i-1', 'missing', '<', 2)]
        await openForest(recipe)
        await expand('missing > 5')
        await choose(BAND, 'class')
        expect(applyEnabled()).toBe(true)
        await press('button.apply')
        expect(entry('Forest').constraints[0].band).toBe('class')
        expect(entry('Water').constraints).toEqual(recipe.model.legend.entries[1].constraints)
        expect(retrieveOffered()).toBe(false)
    })
})

describe('a mapping whose constraints read an input since removed and a band no longer included', () => {
    it('is marked on the Mapping button and the entry\'s row, and opening it writes nothing', async () => {
        const saved = remappingRecipe()
        await open(saved, <RemappingToolbar/>)

        expect(inError(MAPPING)).toBe(true)
        expect(buttonTooltip(MAPPING)).toContain(MISSING_INPUT)
        expect(retrieveOffered()).toBe(false)

        await press(MAPPING)
        expect(rowsInError()).toEqual(['Forest'])

        await openEntry('Forest')
        expect(applyEnabled()).toBe(false)
        expect(model()).toEqual(saved.model)
    })

    it('lets each invalid constraint be expanded in turn, its field saying what is wrong', async () => {
        await openForest()

        await expand(REMOVED_INPUT.description)
        expect(errorsOf(IMAGE)).toEqual([expect.stringContaining('widget.imageConstraints.image.notOffered')])

        await expand(NOT_INCLUDED.description)
        expect(errorsOf(BAND)).toEqual([expect.stringContaining('widget.imageConstraints.band.notOffered')])
        expect(field(IMAGE)).toBeNull()
    })

    it('marks only its invalid constraints while collapsed, each saying why, its fields saying it while expanded', async () => {
        const valid = constraintOf('c-4', 'i-1', 'class', '>', 5)
        await openForest(remappingRecipe([REMOVED_INPUT, NOT_INCLUDED, valid]))

        expect(constraintsMarked()).toEqual([true, true, false])
        expect(summaryTooltips()).toEqual([[IMAGE_NOT_OFFERED], [BAND_NOT_OFFERED], []])

        await expand(NOT_INCLUDED.description)
        expect(constraintsMarked()).toEqual([true, false, false])
        expect(summaryTooltips()).toEqual([[IMAGE_NOT_OFFERED], [], []])
        expect(errorsOf(BAND)).toEqual([BAND_NOT_OFFERED])

        await clickConstraint(1)
        expect(constraintsMarked()).toEqual([true, false, false])
        expect(errorsOf(BAND)).toEqual([BAND_NOT_OFFERED])

        await expand(REMOVED_INPUT.description)
        expect(constraintsMarked()).toEqual([false, true, false])
        expect(summaryTooltips()).toEqual([[], [BAND_NOT_OFFERED], []])
        expect(errorsOf(IMAGE)).toEqual([IMAGE_NOT_OFFERED])

        await choose(IMAGE, ASSET)
        await choose(BAND, 'class')
        expect(applyEnabled()).toBe(false)
        await expand(NOT_INCLUDED.description)
        await choose(BAND, 'class')
        expect(applyEnabled()).toBe(true)

        await clickConstraint(1)
        expect(constraintsMarked()).toEqual([false, false, false])
        expect(innermost(constraintOf('c-2', 'i-1', 'class', '<', 0.3).description)).toBeDefined()
    })

    it('keeps an invalid constraint expanded rather than give way to a valid one', async () => {
        const valid = constraintOf('c-4', 'i-1', 'class', '>', 5)
        await openForest(remappingRecipe([REMOVED_INPUT, NOT_INCLUDED, valid]))
        await expand(NOT_INCLUDED.description)

        await expand(valid.description)

        expect(errorsOf(BAND)).toEqual([expect.stringContaining('widget.imageConstraints.band.notOffered')])
        expect(innermost(valid.description)).toBeDefined()
    })

    it('offers the one input remaining for a removed one, without taking it until chosen', async () => {
        await openForest()

        await expand(REMOVED_INPUT.description)

        expect(constraint('c-1').image).toEqual('i-gone')
        await choose(IMAGE, ASSET)
        await choose(BAND, 'class')
        await expand(NOT_INCLUDED.description)
        await choose(BAND, 'class')
        await press('button.apply')

        expect(constraint('c-1')).toMatchObject({image: 'i-1', imageSource: `ASSET:${ASSET}`, band: 'class', operator: '>', value: 100})
        expect(constraint('c-2')).toMatchObject({image: 'i-1', band: 'class', operator: '<', value: 0.3})
        expect(inError(MAPPING)).toBe(false)
        expect(rowsInError()).toEqual([])
        expect(retrieveOffered()).toBe(true)
    })

    it('is repaired by removing the constraints', async () => {
        await openForest()

        await removeConstraint(REMOVED_INPUT.description)
        await removeConstraint(NOT_INCLUDED.description)
        await press('button.apply')

        expect(entry('Forest').constraints).toEqual([])
        expect(inError(MAPPING)).toBe(false)
    })

    it('is kept as saved when a repair is cancelled', async () => {
        const saved = remappingRecipe()
        await openForest(saved)
        await expand(NOT_INCLUDED.description)
        await choose(BAND, 'class')

        await press('button.cancel')

        expect(model()).toEqual(saved.model)
        expect(inError(MAPPING)).toBe(true)
    })
})

// A reduced optical/radar fixture from .vscode/remapping_A.json, starting before the radar input was removed.
describe('restoring a Remapping input by its exact source', () => {
    it('restores VV_med < -7 only when the same asset is added and applied', async () => {
        const saved = opticalRadarRecipe()
        await open(saved, <RemappingToolbar/>)
        expect(retrieveOffered()).toBe(true)
        await press(IMAGERY)
        await removeInput(RADAR)
        expect(constraint('radar-rule')).toEqual({...RADAR_RULE, imageSource: `ASSET:${RADAR}`})
        await expectMappingBlocked(['B'], 'MISSING_CONSTRAINT_INPUT')

        await press(IMAGERY)
        const removed = model()
        await draftAssetInput(RADAR, 'VV_med')
        expect(model()).toEqual(removed)
        expect(retrieveOffered()).toBe(false)
        await press('button.apply')

        const restored = savedImages().find(image => image.id === RADAR)
        expect(restored.imageId).not.toBe(RADAR_RULE.image)
        expect(constraint('radar-rule')).toEqual({...RADAR_RULE, image: restored.imageId, imageSource: `ASSET:${RADAR}`})
        expect(constraint('optical-rule')).toMatchObject(saved.model.legend.entries[0].constraints[0])
        await expectMappingReady()
    })

    it('retains the source identity through saving and reopening after removal', async () => {
        await open(opticalRadarRecipe(), <RemappingToolbar/>)
        await press(IMAGERY)
        await removeInput(RADAR)
        const persisted = serialize({id: 'remapping-1', type: 'REMAPPING', model: model()})
        await act(async () => root.unmount())
        container.remove()
        await open(deserialize(persisted), <RemappingToolbar/>)
        await expectMappingBlocked(['B'], 'MISSING_CONSTRAINT_INPUT')

        await press(IMAGERY)
        await addAssetInput(RADAR, 'VV_med')

        expect(constraint('radar-rule')).toMatchObject({band: 'VV_med', operator: '<', value: -7})
        await expectMappingReady()
    })

    it('reconnects without changing the band, and stays blocked until that band is included', async () => {
        await open(opticalRadarRecipe(), <RemappingToolbar/>)
        await press(IMAGERY)
        await removeInput(RADAR)
        await addAssetInput(RADAR, 'VH_med')
        expect(constraint('radar-rule')).toEqual({
            ...RADAR_RULE, image: savedImages().find(image => image.id === RADAR).imageId, imageSource: `ASSET:${RADAR}`
        })
        await expectMappingBlocked(['B'], 'CONSTRAINT_BAND_NOT_INCLUDED')

        await press(IMAGERY)
        await click(innermost(RADAR))
        await click(document.querySelector('svg[data-icon="plus"]').closest('button'))
        await click(option('VV_med'))
        expect(retrieveOffered()).toBe(false)
        await press('button.apply')
        await expectMappingReady()
    })

    it('does not reconnect a different asset offering the same band names', async () => {
        await open(opticalRadarRecipe(), <RemappingToolbar/>)
        await press(IMAGERY)
        await removeInput(RADAR)
        await addAssetInput(OTHER_RADAR, 'VV_med')

        expect(constraint('radar-rule')).toEqual({...RADAR_RULE, imageSource: `ASSET:${RADAR}`})
        await expectMappingBlocked(['B'], 'MISSING_CONSTRAINT_INPUT')
    })

    it('does not repair the applied recipe when re-adding the source is cancelled', async () => {
        await open(opticalRadarRecipe(), <RemappingToolbar/>)
        await press(IMAGERY)
        await removeInput(RADAR)
        const removed = model()
        await draftAssetInput(RADAR, 'VV_med')
        await press('button.cancel')

        expect(model()).toEqual(removed)
        await expectMappingBlocked(['B'], 'MISSING_CONSTRAINT_INPUT')
    })

    it('uses the same identity rule for recipe references, preserving all constraint settings', async () => {
        const saved = recipeInputMapping()
        const original = saved.model.legend.entries[1].constraints
        await open(saved, <RemappingToolbar/>)
        await press(IMAGERY)
        await removeInput('Radar recipe')
        await press('button.add')
        await press('process.sourceType.RECIPE')
        await choose('widget.recipeInput.label', 'Radar recipe')
        await click(option('class'))
        expect(constraint('radar-rule').image).toBe('radar-old')
        await press('button.apply')

        const added = savedImages().find(image => image.type === 'RECIPE_REF')
        expect(entry('B').constraints).toEqual(original.map(rule => ({...rule, image: added.imageId, imageSource: `RECIPE_REF:${RADAR}`})))
        await expectMappingReady()
    })

    it('does not confuse an asset with a recipe having the exact same ID and band', async () => {
        await open(recipeInputMapping(), <RemappingToolbar/>)
        await press(IMAGERY)
        await removeInput('Radar recipe')
        await addAssetInput(RADAR, 'class')

        expect(constraint('radar-rule').image).toBe('radar-old')
        await expectMappingBlocked(['B'], 'MISSING_CONSTRAINT_INPUT')
    })

    it('leaves retained identity unchanged when a source change is cancelled', async () => {
        const saved = opticalRadarRecipe()
        saved.model.legend.entries[1].constraints[0].imageSource = `ASSET:${RADAR}`
        await open(saved, <RemappingToolbar/>)
        await press(IMAGERY)
        await click(innermost(RADAR))
        await selectAsset(OTHER_RADAR)
        expect(constraint('radar-rule').imageSource).toBe(`ASSET:${RADAR}`)
        await press('button.cancel')
        expect(model()).toEqual(saved.model)
    })

    it('refreshes retained identity when applying a changed input source', async () => {
        const saved = opticalRadarRecipe()
        saved.model.legend.entries[1].constraints[0].imageSource = `ASSET:${RADAR}`
        await open(saved, <RemappingToolbar/>)
        await press(IMAGERY)
        await click(innermost(RADAR))
        await selectAsset(OTHER_RADAR)
        expect(constraint('radar-rule').imageSource).toBe(`ASSET:${RADAR}`)
        expect(applyEnabled()).toBe(true)
        await press('button.apply')
        expect(constraint('radar-rule')).toEqual({...RADAR_RULE, imageSource: `ASSET:${OTHER_RADAR}`})
        await removeInput(OTHER_RADAR)
        await addAssetInput(RADAR, 'VV_med')
        await expectMappingBlocked(['B'], 'MISSING_CONSTRAINT_INPUT')
        await press(IMAGERY)
        await addAssetInput(OTHER_RADAR, 'VV_med')
        await expectMappingReady()
    })

    it.each([
        ['no retained identity', {image: 'radar-old'}],
        ['malformed retained identity', {image: 'radar-old', imageSource: {type: 'ASSET', id: RADAR}}],
        ['malformed image reference', {image: null, imageSource: `ASSET:${RADAR}`}]
    ])('leaves a legacy orphan with %s invalid', async (_case, reference) => {
        const saved = opticalRadarRecipe()
        saved.model.inputImagery.images.pop()
        saved.model.legend.entries[1].constraints = [{...RADAR_RULE, ...reference}]
        await open(saved, <RemappingToolbar/>)
        await press(IMAGERY)
        await addAssetInput(RADAR, 'VV_med')

        expect(constraint('radar-rule').image).toBe(reference.image)
        await expectMappingBlocked(['B'], 'MISSING_CONSTRAINT_INPUT')
    })

    it('does not retarget a removed duplicate source to its surviving sibling', async () => {
        const saved = opticalRadarRecipe()
        saved.model.inputImagery.images.push({...saved.model.inputImagery.images[1], imageId: 'radar-duplicate'})
        saved.model.legend.entries[1].constraints[0].image = 'radar-duplicate'
        await open(saved, <RemappingToolbar/>)
        await press(IMAGERY)
        await removeInput(RADAR)

        expect(constraint('radar-rule').image).toBe('radar-duplicate')
        expect(constraint('radar-rule').imageSource).toBeUndefined()
        await expectMappingBlocked(['B'], 'MISSING_CONSTRAINT_INPUT')
    })

    it('does not choose between duplicate legacy sources when another input is applied', async () => {
        const saved = opticalRadarRecipe()
        saved.model.inputImagery.images.push({...saved.model.inputImagery.images[1], imageId: 'radar-duplicate'})
        saved.model.inputImagery.images[1].imageId = 'radar-replacement'
        saved.model.legend.entries[1].constraints[0] = {...RADAR_RULE, imageSource: `ASSET:${RADAR}`}
        await open(saved, <RemappingToolbar/>)
        await press(IMAGERY)
        await addAssetInput(OTHER_RADAR, 'VV_med')

        expect(constraint('radar-rule').image).toBe('radar-old')
        await expectMappingBlocked(['B'], 'MISSING_CONSTRAINT_INPUT')
    })
})

describe('a valid mapping edited', () => {
    it('refuses to apply an invalid edit, leaving the applied mapping marked as sound and retrievable', async () => {
        const valid = constraintOf('c-4', 'i-1', 'class', '>', 5)
        const saved = remappingRecipe([valid])
        await openForest(saved)
        await expand(valid.description)

        await typeInto(field(VALUE).querySelector('input'), '')

        expect(applyEnabled()).toBe(false)
        expect(inError(MAPPING)).toBe(false)
        expect(rowsInError()).toEqual([])
        expect(retrieveOffered()).toBe(true)
        expect(model()).toEqual(saved.model)
    })
})

describe('Index Change\'s mapping, not checking references', () => {
    it('applies a constraint reading a band or an image it does not offer, as before', async () => {
        const constraints = [
            constraintOf('c-1', 'this-recipe', 'not_a_band', '>', 1),
            constraintOf('c-2', 'gone', 'difference', '>', 1)
        ]
        await open(indexChangeRecipe(constraints), <IndexChangeToolbar/>)
        await press('process.indexChange.panel.mapping.button.label')
        await openEntry('Decrease')

        await expand(constraints[0].description)
        expect(errorsOf(BAND)).toEqual([])
        await expand(constraints[1].description)
        expect(field(IMAGE)).toBeNull()

        expect(applyEnabled()).toBe(true)
    })
})

const ASSET = 'users/x/a'
const OPTICAL = 'projects/wiell-testing/assets/costa-rica/optical'
const RADAR = 'projects/wiell-testing/assets/costa-rica/radar'
const OTHER_RADAR = 'projects/wiell-testing/assets/costa-rica/other-radar'
const assetBands = asset => sourceBands[asset] || (asset === ASSET ? ['class'] : asset === OPTICAL ? ['nbr'] : ['VV_med', 'VH_med', 'class'])
const MAPPING = 'process.remapping.panel.mapping.button.label'
const IMAGERY = 'process.panels.inputImagery.button'
const IMAGE = 'widget.imageConstraints.image.label'
const BAND = 'widget.imageConstraints.band.label'
const VALUE = 'widget.imageConstraints.value.label'
const IMAGE_NOT_OFFERED = expect.stringContaining('widget.imageConstraints.image.notOffered')
const BAND_NOT_OFFERED = expect.stringContaining('widget.imageConstraints.band.notOffered')
const MISSING_INPUT = 'process.remapping.requirement.missingInput'

const constraintOf = (id, image, band, operator, value) => ({
    id, description: `${band} ${operator} ${value}`, image, band, property: null, bit: false, fromBit: null, toBit: null,
    fromBitInclusive: true, toBitInclusive: true, operator, value
})

const REMOVED_INPUT = constraintOf('c-1', 'i-gone', 'elevation', '>', 100)
const NOT_INCLUDED = constraintOf('c-2', 'i-1', 'ndvi', '<', 0.3)

// One asset input including `class` alone; Forest reads an input since removed and a band the input does not include,
// Water reads `class`.
const remappingRecipe = (forest = [REMOVED_INPUT, NOT_INCLUDED]) => ({
    id: 'remapping-1',
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [
            {imageId: 'i-1', type: 'ASSET', id: ASSET, includedBands: [{id: 'b-class', band: 'class', type: 'continuous', legendEntries: []}]}
        ]},
        legend: {entries: [
            {id: 'l-1', color: '#00ff00', value: 1, label: 'Forest', booleanOperator: 'and', constraints: forest},
            {id: 'l-2', color: '#0000ff', value: 2, label: 'Water', booleanOperator: 'and', constraints: [constraintOf('c-3', 'i-1', 'class', '>', 2)]}
        ]}
    }
})

const RADAR_RULE = constraintOf('radar-rule', 'radar-old', 'VV_med', '<', -7)
const inputOf = (imageId, id, band, type = 'ASSET') => ({
    imageId, type, id, includedBands: [{id: `band-${imageId}`, band, type: 'continuous', legendEntries: []}]
})
const opticalRadarRecipe = () => ({
    id: 'remapping-1', type: 'REMAPPING', model: {
        inputImagery: {images: [inputOf('optical', OPTICAL, 'nbr'), inputOf('radar-old', RADAR, 'VV_med')]},
        legend: {entries: [
            {id: 'a', value: 1, color: '#FFB300', label: 'A', constraints: [constraintOf('optical-rule', 'optical', 'nbr', '<', 500)]},
            {id: 'b', value: 2, color: '#803E75', label: 'B', constraints: [{...RADAR_RULE}]}
        ]}
    }
})
const sourceRecipe = id => ({
    id, type: 'REMAPPING', revision: 1,
    model: {
        inputImagery: {images: [inputOf('source-optical', OPTICAL, 'nbr')]},
        legend: {entries: [{id: 'source-class', value: 1, label: 'Class', color: '#000000'}]}
    }
})
const recipeInputMapping = () => {
    const saved = opticalRadarRecipe()
    saved.model.inputImagery.images[1] = inputOf('radar-old', RADAR, 'class', 'RECIPE_REF')
    saved.model.legend.entries[1].constraints = [
        {...RADAR_RULE, band: 'class'},
        {...RADAR_RULE, id: 'classes', band: 'class', operator: 'class', selectedClasses: [1, 4]},
        {...RADAR_RULE, id: 'range', band: 'class', operator: 'range', from: -7, to: 2, fromInclusive: false, toInclusive: true,
            bit: true, fromBit: 1, toBit: 3, extension: {keep: true}}
    ]
    return saved
}

const indexChangeRecipe = constraints => ({
    id: 'index-change-1',
    type: 'INDEX_CHANGE',
    model: {
        ...indexChangeModel,
        legend: {entries: [{id: 'l-1', color: '#d73027', value: 1, label: 'Decrease', booleanOperator: 'and', constraints}]}
    }
})

async function expectMappingBlocked(labels, code) {
    expect(inError(MAPPING)).toBe(true)
    expect(retrieveOffered()).toBe(false)
    expect(previewGate()).toMatchObject({code: 'CONFIGURATION_UNMET', withdraw: true})
    expect(sharedFindings().map(finding => finding.code)).toContain(code)
    await press(MAPPING)
    expect(rowsInError()).toEqual(labels)
}

async function expectMappingReady() {
    expect(inError(MAPPING)).toBe(false)
    expect(retrieveOffered()).toBe(true)
    expect(previewGate()).toBeNull()
    expect(sharedFindings()).toEqual([])
    await press(MAPPING)
    expect(rowsInError()).toEqual([])
}

// An input removed from Input imagery by its row's remove button, confirmed.
async function removeInput(source) {
    let element = innermost(source)
    while (!element.querySelector('svg[data-icon="trash"]')) {
        element = element.parentElement
    }
    await pressFully(element.querySelector('svg[data-icon="trash"]').closest('button'))
    await pressFully(button('button.remove'))
}

// An asset input added through the real editor. Its draft changes no applied mapping.
async function draftAssetInput(asset, band) {
    await press('button.add')
    await selectAsset(asset)
    await click(option(band))
}

async function selectAsset(asset) {
    const input = field('process.classChange.panel.inputImage.asset.label').querySelector('input')
    await click(input)
    await typeInto(input, asset)
    await click(option(asset))
}

async function addAssetInput(asset, band) {
    await draftAssetInput(asset, band)
    await press('button.apply')
}

// Forest's constraints opened from its row in Mapping.
async function openForest(saved = remappingRecipe()) {
    await open(saved, <RemappingToolbar/>)
    await press(MAPPING)
    await openEntry('Forest')
}

async function open(recipe, toolbar, sources = []) {
    sourceRecipes = Object.fromEntries(sources.map(source => [source.id, source]))
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {...Object.fromEntries(sources.map(source => [source.id, {...source, ui: {initialized: true}}])), [RADAR]: sourceRecipe(RADAR), [recipe.id]: {...recipe, revision: 1, ui: {initialized: true}}},
            recipes: [...sources.map(({id, type, title}) => ({id, type, name: title, revision: 1})), {id: recipe.id, name: 'Recipe', type: recipe.type, revision: 1}, {id: RADAR, name: 'Radar recipe', type: 'REMAPPING', revision: 1}],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            folders: [],
            tabs: [...sources.map(({id}) => ({id})), {id: recipe.id}]
        },
        assets: {user: [ASSET, OPTICAL, RADAR, OTHER_RADAR].map(id => ({id, type: 'Image', updateTime: 'T1'})), other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <ActivationContext id='root'>
                <SourceRuntimeProvider>
                    <Runtime/>
                    <Recipe id={recipe.id}>
                        <EventShield>
                            <PortalContainer/>
                            <PortalContainer id='panels'/>
                            <PortalContext id='panels'>
                                {toolbar}
                            </PortalContext>
                        </EventShield>
                    </Recipe>
                </SourceRuntimeProvider>
            </ActivationContext>
        </Provider>
    ))
    await settled()
}

// A button pressed, as a click; a disabled one ignores it.
async function press(label) {
    await act(async () => button(label).click())
    await settled()
}

// A button pressed as a pointer presses it, from entering it to clicking it.
async function pressFully(element) {
    await act(async () => ['mouseenter', 'mousedown', 'mouseup', 'click']
        .forEach(type => element.dispatchEvent(new MouseEvent(type, {bubbles: true}))))
    await settled()
}

// A legend entry's constraints opened from its row.
async function openEntry(label) {
    await click(innermost(label))
}

// A constraint in the modal expanded from its summary, which only a collapsed constraint shows.
async function expand(description) {
    await click(innermost(description))
}

// A constraint in the modal clicked by its row, expanded or not.
async function clickConstraint(index) {
    await click(constraintRows()[index].firstElementChild)
}

async function choose(label, offered) {
    await click(field(label).querySelector('input'))
    await click(option(offered))
}

const option = label => [...document.querySelectorAll('[data-hook="option"]')].find(element => element.textContent.includes(label))

// A constraint removed from the modal, its trash button pressed briefly, as a click.
async function removeConstraint(description) {
    let element = innermost(description)
    while (!element.querySelector('svg[data-icon="trash"]')) {
        element = element.parentElement
    }
    const trash = element.querySelector('svg[data-icon="trash"]').closest('button')
    await act(async () => ['mouseenter', 'mousedown', 'mouseup']
        .forEach(type => trash.dispatchEvent(new MouseEvent(type, {bubbles: true}))))
    await settled()
}

async function typeInto(input, text) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

async function click(element) {
    await act(async () => element.click())
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', 'remapping-1', 'model'])

const savedImages = () => model().inputImagery.images

const sharedFindings = () => {
    const state = store.getState()
    const recipe = selectFrom(state, ['process.loadedRecipes', 'remapping-1'])
    return readImageOutput({
        graph: buildMapDependencyGraph({recipe, loadedRecipes: state.process.loadedRecipes}),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        readinessFor: ({type}) => recipeType(type),
        observationFor: ({type, id}) => type === 'ASSET'
            ? {bands: assetBands(id).map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
            : undefined
    }).readiness.findings
}

const Runtime = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

// Why a new preview of the Remapping may not be requested, as a layer showing it asks.
const previewGate = () => requestGate({
    state: store.getState(),
    recipe: selectFrom(store.getState(), ['process.loadedRecipes', 'remapping-1']),
    operation: 'IMAGE_OUTPUT',
    evidenceOwnerOf: id => runtime.evidenceOwnerOf(id),
    heldFor: key => runtime.heldFor(key),
    now: Date.now()
})

const entry = label => model().legend.entries.find(entry => entry.label === label)

const constraint = id => model().legend.entries.flatMap(entry => entry.constraints || []).find(constraint => constraint.id === id)

// The deepest element showing exactly this text.
const innermost = text => [...document.querySelectorAll('*')]
    .filter(element => element.textContent === text && ![...element.children].some(child => child.textContent === text))
    .pop()

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))

const applyEnabled = () => button('button.apply')?.disabled === false

// Whether the toolbar's Retrieve button can be pressed.
const retrieveOffered = () => ![...document.querySelectorAll('[data-tooltip]')]
    .find(element => element.dataset.tooltip.includes('process.retrieve.tooltip'))
    .querySelector('button').disabled

const inError = label => button(label).classList.contains(classOf(toolbarButtonStyles, 'error'))

const buttonTooltip = label => [...document.querySelectorAll('[data-tooltip]')]
    .filter(element => element.contains(button(label)))
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .join(' | ')

// The constraints of the open modal, in order: every list row but those of Mapping's legend entries.
const constraintRows = () => [...document.getElementsByClassName(classOf(listItemStyles, 'verticalWrapper'))]
    .filter(row => !['Forest', 'Water'].some(label => row.textContent.includes(label)))

// Whether each constraint's row is marked in error.
const constraintsMarked = () => constraintRows()
    .map(row => !!row.querySelector(`.${classOf(listItemStyles, 'main')} .${classOf(errorIndicatorStyles, 'indicator')}`))

// What each constraint's summary - its row's main part, not its fields - says of it.
const summaryTooltips = () => constraintRows()
    .map(row => [...row.querySelector(`.${classOf(listItemStyles, 'main')}`).querySelectorAll('[data-tooltip]')]
        .flatMap(element => JSON.parse(element.dataset.tooltip)))

// The legend entries whose rows in Mapping are marked in error, by label; a constraint's row names none.
const rowsInError = () => [...document.getElementsByClassName(classOf(errorIndicatorStyles, 'indicator'))]
    .map(indicator => indicator.closest(`.${classOf(listItemStyles, 'verticalWrapper')}`))
    .map(row => model().legend.entries.map(entry => entry.label).find(label => [...row.querySelectorAll('*')].some(element => element.textContent === label)))
    .filter(Boolean)

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label).querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const classOf = (styles, name) => {
    if (!styles[name]) {
        throw new Error(`No ${name} class to look for`)
    }
    return styles[name]
}
