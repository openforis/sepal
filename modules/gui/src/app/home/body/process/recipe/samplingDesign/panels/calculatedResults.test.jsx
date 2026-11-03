import _ from 'lodash'
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {allocationReviewInputs} from '#sepal/recipe/samplingDesign/allocationReview'
import {stratumFrameQuestion} from '#sepal/recipe/samplingDesign/stratumFrame'
import {probabilitySourceQuestion, stratumProbabilitiesQuestion} from '#sepal/recipe/samplingDesign/stratumProbabilities'
import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, useSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// The stratum areas and automatic proportions Sampling Design's panels calculate as they open and as they are edited:
// answered, failed, answered late or over other inputs, and applied by Apply, Enter or a set-up wizard's Next, or
// cancelled - and what a design closed to them says once what they read changes. The panels, their form panel and its
// calculation binding, the requirements, the store and the source runtime the app composes over it are real, the
// design's dependency evidence watched as its editor watches it; Earth Engine, the panel chrome's activation, the
// pickers and the tables are substituted.

const harness = vi.hoisted(() => ({evidenceReads: [], calculations: [], wizard: null, inputs: {}}))

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/apiRegistry', () => {
    const read = reads => body => {
        const response$ = new Subject()
        reads.push({body, response$})
        return response$
    }
    return {
        default: {
            gee: {
                dependencyEvidence$: read(harness.evidenceReads),
                areaPerStratum$: read(harness.calculations),
                probabilityPerStratum$: read(harness.calculations),
                assetVersions$: () => NEVER
            },
            recipe: {loadAll$: () => NEVER}
        }
    }
})
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: () => harness.type, isImageSource: () => true
}))
vi.mock('~/widget/panelWizard', () => ({
    withPanelWizard: () => Component => props => <Component {...props} panelWizard={harness.wizard}/>
}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// The source recipe's bands load as the panel opens, with a legend of its own for them.
vi.mock('~/widget/recipeInput', () => ({RecipeInput: ({onBandsLoaded}) => {
    React.useEffect(() => onBandsLoaded({bandNames: ['class'], recipe: {}}), [])
    return null
}}))
vi.mock('~/app/home/body/process/recipe/visualizations', () => ({
    recipeVisualizationsNaming: () => [{type: 'categorical', bands: ['class'], values: [1], labels: ['Legend'], palette: ['#ff0000']}]
}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => <Component {...props} activatable={{active: true, deactivate: () => {}}}/>
}))
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props => <Component {...props} activator={{activatables: {legendImport: {activate: () => {}}}}}/>
}))
vi.mock('./stratification/strataTable', () => ({StrataTable: ({strata}) => {
    harness.inputs.strata = strata
    return null
}}))
vi.mock('./proportions/proportionControls', () => ({
    AnticipationStrategy: () => null,
    ImageSelection: ({inputs}) => {
        harness.inputs.scale = inputs.scale
        return null
    },
    OverallProportionInput: () => null,
    ProportionsHeaderButtons: ({manual, onManualToggled}) => {
        harness.toggleManual = on => {
            manual.set(on ? [true] : [])
            onManualToggled(on)
        }
        return null
    },
    StrataProportion: ({anticipatedProportions, calculationError, feedback, emptyMessage}) => {
        harness.inputs.anticipatedProportions = anticipatedProportions
        harness.proportions = {calculationError, feedback, emptyMessage}
        return null
    }
}))

const {samplingDesignRequirements, samplesGate} = await import('../freshnessRequirements')
const {sectionProblemsOfState} = await import('../../selectedSourceStatus')
const {samplingDesignCalculations} = await import('../calculations')
const {Stratification} = await import('./stratification/stratification')
const {Proportions} = await import('./proportions/proportions')
const {isSectionStale} = await import('../sampling/validateRetrieve')

harness.type = {sourceRequirements: samplingDesignRequirements, calculatedResults: samplingDesignCalculations}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const FRAME = 'SAMPLING_STRATUM_FRAME'
const PROBABILITY = 'SAMPLING_PROBABILITY_SOURCE'
const AOI = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]}

let store, root, container

beforeEach(() => {
    harness.evidenceReads.length = 0
    harness.calculations.length = 0
    harness.inputs = {}
    harness.wizard = {next: vi.fn()}
})

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
    root = container = null
})

// Every way a form panel's values are submitted: its Apply button, Enter in its form, and a set-up wizard's Next, which
// Enter means while the wizard walks through the panel.
const SUBMISSIONS = [
    ['Apply', () => click('button.apply')],
    ['Enter', () => submitForm()],
    ['a wizard\'s Next', async () => {
        await act(async () => {
            harness.wizard = {...harness.wizard, wizard: ['stratification', 'proportions']}
            root.render(view(harness.panel))
        })
        await submitForm()
    }]
]

describe('the Stratification panel', () => {
    it.each([['ONLINE', false], ['BATCH', true]])('opened %s over stale areas, calculates them in that mode, with their evidence', async (eeStrategy, batch) => {
        await open(Stratification, stratified({eeStrategy, areas: 'before'}), {digest: 'after'})

        expect(harness.calculations.map(({body}) => _.pick(body, ['batch', 'evidence']))).toEqual([{batch, evidence: true}])
    })

    it.each([
        ['not calculated yet', () => selected()],
        ['saved without evidence', () => stratified({})],
        ['stale', () => stratified({areas: 'before'})]
    ])('opened over areas %s, waits for the frame\'s evidence, and calculates them once it is read', async (_name, design) => {
        await open(Stratification, design(), null)

        expect(harness.calculations).toEqual([])

        await answerEvidence({digest: 'after'})

        expect(harness.calculations).toHaveLength(1)
    })

    it('says it is checking the frame in place of areas not calculated yet', async () => {
        await open(Stratification, selected(), null)

        expect(text()).toContain('process.samplingDesign.panel.stratification.form.result.checking')
        expect(text()).not.toContain('process.samplingDesign.panel.stratification.form.strata.noData')
    })

    it('asks nothing for areas while the frame cannot be read', async () => {
        await open(Stratification, selected(), null)

        await failEvidence()

        expect(harness.calculations).toEqual([])
        expect(text()).toContain('process.samplingDesign.retrieve.evidence.SOURCE_UNAVAILABLE')
    })

    it('asks nothing for areas not calculated yet over a source that cannot report replacement', async () => {
        await open(Stratification, selected(), {unversioned: ['gs://bucket/strata.tif']})

        expect(harness.calculations).toEqual([])
        expect(text()).toContain('process.samplingDesign.panel.stratification.form.result.UNVERSIONED')
    })

    it('opened over areas saved without evidence, calculates them once', async () => {
        await open(Stratification, stratified({}), {})

        await answer({groups: [{stratum: 1, area: 100}], calculatedFrom: areasFrom(frameOf(applied(), {}))})
        await answerEvidence()

        expect(harness.calculations).toHaveLength(1)
    })

    it('opened over current areas, asks nothing, also once a revision leaving their frame the same is read', async () => {
        await open(Stratification, stratified({areas: 'frame'}), {})

        await list(2)

        expect(harness.evidenceReads.length).toBeGreaterThan(1)
        expect(harness.calculations).toEqual([])
    })

    it('opened over areas from a source that cannot report replacement, asks nothing', async () => {
        await open(Stratification, stratified({areas: 'frame'}), {unversioned: ['gs://bucket/strata.tif']})

        expect(harness.calculations).toEqual([])
    })

    it('applies recalculated areas together with what they were calculated from, repairing stale ones', async () => {
        await open(Stratification, stratified({areas: 'before'}), {digest: 'after'})

        await answer({groups: [{stratum: 1, area: 200}], calculatedFrom: areasFrom(frameOf(applied(), {digest: 'after'}))})
        await click('button.apply')

        expect(applied().stratification.strata.map(({area}) => area)).toEqual([200])
        expect(applied().stratification.strataCalculatedFrom.dependencies[FRAME].digest).toBe('after')
    })

    it('keeps recalculated areas in the draft: Cancel leaves the stale areas applied', async () => {
        await open(Stratification, stratified({areas: 'before'}), {digest: 'after'})

        await answer({groups: [{stratum: 1, area: 200}], calculatedFrom: areasFrom(frameOf(applied(), {digest: 'after'}))})
        await click('button.cancel')

        expect(applied().stratification.strata.map(({area}) => area)).toEqual([100])
        expect(applied().stratification.strataCalculatedFrom.dependencies[FRAME].digest).toBe('before')
        expect(harness.calculations).toHaveLength(1)
    })

    it('keeps the labels and colors of recalculated strata', async () => {
        await open(Stratification, stratified({areas: 'before'}), {digest: 'after'})

        await answer({groups: [{stratum: 1, area: 200}], calculatedFrom: areasFrom(frameOf(applied(), {digest: 'after'}))})
        await click('button.apply')

        expect(applied().stratification.strata).toEqual([expect.objectContaining({value: 1, label: 'Original', color: '#00aa00', area: 200})])
    })

    it('refuses Apply while the areas are being calculated', async () => {
        await open(Stratification, stratified({}), {})
        await act(async () => harness.inputs.strata.set([{...harness.inputs.strata.value[0], label: 'Edited'}]))

        await click('button.apply')

        expect(applied().stratification.strata[0].label).toBe('Original')
    })

    it('calculates again once what the areas were just calculated from changes while the panel is open', async () => {
        await open(Stratification, stratified({areas: 'before'}), {digest: 'after'})
        await answer({groups: [{stratum: 1, area: 200}], calculatedFrom: areasFrom(frameOf(applied(), {digest: 'after'}))})

        await list(2, {digest: 'changed again'})

        expect(harness.calculations).toHaveLength(2)
    })

    it('does not calculate again what failed, until asked to retry', async () => {
        await open(Stratification, stratified({areas: 'before'}), {digest: 'after'})

        await fail(new Error('Earth Engine failed'))
        await list(2, {digest: 'after'})

        expect(harness.calculations).toHaveLength(1)

        await click('process.samplingDesign.calculationError.retryOnline')

        expect(harness.calculations).toHaveLength(2)
    })

    it('does not take areas answered over a revision the session already knows was superseded, nor ask again', async () => {
        await open(Stratification, stratified({}), {})

        await list(2)
        await answer({groups: [{stratum: 1, area: 200}], calculatedFrom: areasFrom(frameOf(applied(), {revision: 1}))})

        expect(text()).toContain('process.samplingDesign.panel.stratification.form.result.superseded')
        expect(button('button.apply')).toBeUndefined()
        expect(harness.calculations).toHaveLength(1)
    })

    it('does not take areas answered after the design was switched to unstratified', async () => {
        await open(Stratification, stratified({}), {})
        await click('process.samplingDesign.panel.stratification.form.skip.label')

        await answer({groups: [{stratum: 1, area: 200}], calculatedFrom: areasFrom(frameOf(applied(), {}))})
        await click('button.apply')

        expect(applied().stratification).toMatchObject({skip: true, strataCalculatedFrom: null})
        expect(applied().stratification.strata.map(({area}) => area)).not.toContain(200)
    })

    it.each(SUBMISSIONS)('refuses %s of edited areas once the inputs they were calculated from changed, calculating them again', async (_name, submit) => {
        await open(Stratification, stratified({areas: 'frame'}), {})
        await act(async () => harness.inputs.strata.set([{...harness.inputs.strata.value[0], label: 'Edited'}]))

        await list(2, {digest: 'changed'})
        await submit()

        expect(applied().stratification.strata[0].label).toBe('Original')
        expect(harness.calculations).toHaveLength(1)
        expect(harness.wizard.next).not.toHaveBeenCalled()
    })

    it('calculates the areas of an edited CRS, applicable through a revision leaving their frame the same', async () => {
        // A CRS other than the default is shown without asking for more.
        await open(Stratification, stratified({areas: 'frame'}), {})
        await type('process.samplingDesign.panel.stratification.form.crs.label', 'EPSG:32631')
        await answerEvidence({digest: EDITED_FRAME})
        await answer({groups: [{stratum: 1, area: 200}], calculatedFrom: areasFrom(frameOf(edited(), {digest: 'edited'}))})

        await list(2, {digest: EDITED_FRAME})
        await click('button.apply')

        expect(harness.calculations).toHaveLength(1)
        expect(applied().stratification).toMatchObject({crs: 'EPSG:32631', strata: [{area: 200}]})
    })
})

describe('the Proportions panel', () => {
    it.each([['ONLINE', false], ['BATCH', true]])('opened %s over proportions for strata the design no longer has, calculates them in that mode over the current areas', async (eeStrategy, batch) => {
        await open(Proportions, stratified({areas: 'after', proportions: {frame: 'after', rows: [{stratum: 2, proportion: 0.5}], eeStrategy}}), {digest: 'after'})

        expect(harness.calculations.map(({body}) => _.pick(body, ['batch', 'evidence']))).toEqual([{batch, evidence: true}])
    })

    it.each([
        ['not calculated yet', {empty: true}],
        ['saved without evidence', {}]
    ])('opened over proportions %s, waits for the evidence of what they read, and calculates them once it is read', async (_name, proportions) => {
        await open(Proportions, unstratified(proportions), null)

        expect(harness.calculations).toEqual([])

        await answerEvidence({digest: 'aoi'})

        expect(harness.calculations).toHaveLength(1)
    })

    it('asks nothing for proportions not calculated yet while the frame cannot be read', async () => {
        await open(Proportions, unstratified({empty: true}), null)

        await failEvidence()

        expect(harness.calculations).toEqual([])
        expect(harness.proportions.emptyMessage).toBe('process.samplingDesign.retrieve.evidence.SOURCE_UNAVAILABLE')
    })

    it('asks nothing for proportions not calculated yet over a frame that cannot report replacement', async () => {
        await open(Proportions, unstratified({empty: true}), {unversioned: ['gs://bucket/aoi.tif']})

        expect(harness.calculations).toEqual([])
        expect(harness.proportions.emptyMessage).toBe('process.samplingDesign.panel.proportions.form.result.UNVERSIONED')
    })

    it('asks nothing for proportions not calculated yet over a probability source that cannot report replacement', async () => {
        await open(Proportions, unstratified({empty: true}), {digest: 'aoi', source: {unversioned: ['gs://bucket/probability.tif']}})

        expect(harness.calculations).toEqual([])
        expect(harness.proportions.emptyMessage).toBe('process.samplingDesign.panel.proportions.form.result.UNVERSIONED')
    })

    it('opened over current proportions, asks nothing', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {frame: 'areas'}}), {digest: 'areas'})

        expect(harness.calculations).toEqual([])
    })

    it.each([
        ['the probability recipe', {'probability-1': 2}],
        ['a recipe the probability recipe reads', {'mosaic-1': 2}]
    ])('opened over current proportions, calculates them again once %s changes, though the frame does not', async (_name, revisions) => {
        await open(Proportions, stratified({areas: 'areas', proportions: {frame: 'areas'}}), {digest: 'areas'})

        await relist(revisions, {source: {digest: 'changed'}})

        expect(harness.calculations).toHaveLength(1)
        expect(harness.calculations[0].body.probability).toEqual({type: 'RECIPE_REF', id: 'probability-1'})
    })

    it('opened over proportions whose probability source changed since they were saved, calculates them again', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {frame: 'areas'}}), {digest: 'areas', source: {digest: 'changed'}})

        expect(harness.calculations).toHaveLength(1)
    })

    it('opened over current proportions, asks nothing once the probability recipe only changed its title', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {frame: 'areas'}}), {digest: 'areas'})

        await relist({'probability-1': 2}, {source: {digest: 'source'}})

        expect(harness.calculations).toEqual([])
    })

    it('calculates proportions again for an edited Scale, though their frame is the same', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {frame: 'areas'}}), {digest: 'areas'})

        await act(async () => harness.inputs.scale.set(60))
        await settled()

        expect(harness.calculations.map(({body}) => body.scale)).toEqual([60])
    })

    it('switched to manual over rows for strata the design no longer has, keeps their answers for the strata it has', async () => {
        const restratified = stratified({areas: 'areas', proportions: {frame: 'areas', rows: [{stratum: 1, proportion: 0.5}, {stratum: 3, proportion: 0.2}]}})
        restratified.model.stratification.strata = [...restratified.model.stratification.strata, {value: 2, label: 'New', color: '#0000aa', area: 100, weight: 1}]
        await open(Proportions, restratified, {digest: 'areas'})

        await act(async () => harness.toggleManual(true))
        await click('button.apply')

        expect(applied().proportions.anticipatedProportions).toEqual([{stratum: 1, proportion: 0.5}, {stratum: 2}])
        expect('requiresUpdate' in applied().proportions).toBe(false)
    })

    it('switched to manual over flagged proportions holding no rows, settles the answers entered', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {empty: true, requiresUpdate: true}}), {digest: 'areas'})

        await act(async () => harness.toggleManual(true))
        await act(async () => harness.inputs.anticipatedProportions.set([{stratum: 1, proportion: 40}]))
        await click('button.apply')

        expect(applied().proportions).toMatchObject({manual: [true], anticipatedProportions: [{stratum: 1, proportion: 0.4}]})
        expect(isSectionStale(applied(), 'proportions')).toBe(false)
    })

    it('asks nothing of a probability source of no known type, though an asset id is retained', async () => {
        const malformed = stratified({areas: 'areas', proportions: {empty: true, eeStrategy: 'BATCH'}})
        malformed.model.proportions = {...malformed.model.proportions, type: 'UNKNOWN', assetId: 'users/x/probability'}
        await open(Proportions, malformed, {digest: 'areas'})

        expect(harness.calculations).toEqual([])
    })

    it('opened over manual proportions, reads no probability source and asks nothing', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {manual: true}}), {digest: 'areas'})

        expect(harness.evidenceReads.map(({body}) => body.dependency)).not.toContain(PROBABILITY)
        expect(harness.calculations).toEqual([])
    })

    it('asks nothing while the areas are still being checked, and calculates once they are current', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {}}), null)

        expect(harness.calculations).toEqual([])

        await answerEvidence({digest: 'areas'})

        expect(harness.calculations).toHaveLength(1)
    })

    it('asks nothing while the areas are not current, saying it waits on them', async () => {
        await open(Proportions, stratified({areas: 'before', proportions: {}}), {digest: 'after'})

        expect(harness.calculations).toEqual([])
        expect(harness.proportions.feedback).toEqual({warningMessage: 'process.samplingDesign.panel.proportions.form.result.held'})
    })

    it('does not take probabilities over another frame than the areas\', though areas and weights are equal, nor ask again', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {}}), {digest: 'areas'})
        const opened = harness.inputs.anticipatedProportions.value

        await answer(probabilitiesAnswer({frame: 'another frame'}))

        expect(harness.proportions.calculationError.message).toBe('process.samplingDesign.panel.proportions.form.result.superseded')
        expect(harness.inputs.anticipatedProportions.value).toEqual(opened)
        expect(harness.calculations).toHaveLength(1)
    })

    it('does not take probabilities answered over a probability recipe revision the session already knows was superseded, nor ask again', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {}}), {digest: 'areas'})

        await relist({'probability-1': 2}, {source: {digest: 'source'}})
        await answer(probabilitiesAnswer({frame: 'areas', sourceRevision: 1}))

        expect(harness.proportions.calculationError.message).toBe('process.samplingDesign.panel.proportions.form.result.superseded')
        expect(harness.calculations).toHaveLength(1)
    })

    it('takes probabilities with what they were calculated from, and applies that evidence alone', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {}}), {digest: 'areas'})

        await answer(probabilitiesAnswer({frame: 'areas', source: 'calculated'}))
        await click('button.apply')

        const {probabilityPerStratumCalculatedFrom: calculatedFrom} = applied().proportions
        expect(calculatedFrom.dependencies[FRAME].digest).toBe('areas')
        expect(calculatedFrom.dependencies[PROBABILITY].digest).toBe('calculated')
        expect(applied().proportions.probabilityPerStratum).toEqual(PROBABILITIES)
        expect('stratumFrameEvidence' in applied().proportions).toBe(false)
    })

    it('keeps recalculated probabilities in the draft: Cancel leaves the saved ones applied', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {frame: 'areas'}}), {digest: 'areas', source: {digest: 'changed'}})

        await answer(probabilitiesAnswer({frame: 'areas', source: 'changed'}))
        await click('button.cancel')

        expect(applied().proportions.probabilityPerStratumCalculatedFrom.dependencies[PROBABILITY].digest).toBe('source')
        expect(applied().proportions.probabilityPerStratum).toEqual([{stratum: 1, probability: 0.5}])
    })

    it('takes an unstratified design\'s probabilities over its AOI and CRS, without any area evidence', async () => {
        await open(Proportions, unstratified({}), {})

        await answer(probabilitiesAnswer({frame: 'aoi'}))
        await click('button.apply')

        expect(harness.calculations[0].body).toMatchObject({stratification: null, evidence: true})
        expect(applied().proportions.probabilityPerStratumCalculatedFrom.dependencies[FRAME].digest).toBe('aoi')
    })

    it('asks an unstratified design stating no CRS in the CRS its frame is read in, and holds the answer current', async () => {
        const noCrs = unstratified({})
        delete noCrs.model.stratification.crs
        await open(Proportions, noCrs, {})

        await answer(probabilitiesAnswer({frame: 'aoi'}))
        await click('button.apply')
        await answerEvidence({digest: 'aoi'})

        expect(harness.calculations[0].body.crs).toBe('EPSG:6933')
        expect(harness.evidenceReads.find(({body}) => body.dependency === FRAME).body.question.crs).toBe('EPSG:6933')
        expect(harness.calculations).toHaveLength(1)
    })

    it.each(SUBMISSIONS)('refuses %s of edited proportions once the frame they were calculated over changed, calculating them again', async (_name, submit) => {
        await open(Proportions, unstratified({frame: 'frame'}), {})
        await act(async () => harness.inputs.anticipatedProportions.set([{stratum: 1, proportion: 40}]))

        await list(2, {digest: 'changed'})
        await submit()

        expect(applied().proportions.anticipatedProportions).toEqual([{stratum: 1, proportion: 0.5}])
        expect(harness.calculations).toHaveLength(1)
        expect(harness.wizard.next).not.toHaveBeenCalled()
    })

    it('refuses Apply of edited proportions once their probability source changed, calculating them again', async () => {
        await open(Proportions, unstratified({frame: 'frame'}), {})
        await act(async () => harness.inputs.anticipatedProportions.set([{stratum: 1, proportion: 40}]))

        await relist({'probability-1': 2}, {source: {digest: 'changed'}})
        await click('button.apply')

        expect(applied().proportions.anticipatedProportions).toEqual([{stratum: 1, proportion: 0.5}])
        expect(harness.calculations).toHaveLength(1)
    })
})

describe('manual proportions', () => {
    it.each([
        ['the form\'s toggle', true],
        ['an earlier version\'s flag', 'flag']
    ])('saved as %s, opened over strata that changed, keep each answer with its stratum in the draft, a new one unanswered and a vanished one gone; Cancel leaves them as saved', async (_name, manual) => {
        const restratified = stratified({areas: 'areas', proportions: {manual, rows: [{stratum: 1, proportion: 0.5}, {stratum: 2, proportion: 0.2}]}})
        restratified.model.stratification.strata = [{value: 3, label: 'New', color: '#0000aa', area: 100, weight: 0.5}, {value: 1, label: 'Original', color: '#00aa00', area: 100, weight: 0.5}]
        const saved = restratified.model.proportions.anticipatedProportions
        await open(Proportions, restratified, {digest: 'areas'})

        expect(harness.inputs.anticipatedProportions.value).toEqual([{stratum: 3}, {stratum: 1, proportion: 50}])

        await click('button.cancel')

        expect(applied().proportions.anticipatedProportions).toEqual(saved)
        expect(marks()).toEqual({proportions: 'error'})
    })

    it('saved with an empty skip toggle, are not skipped: Apply keeps the answers edited', async () => {
        const design = stratified({areas: 'areas', proportions: {manual: true}})
        design.model.proportions.skip = []
        await open(Proportions, design, {digest: 'areas'})

        await act(async () => harness.inputs.anticipatedProportions.set([{stratum: 1, proportion: 40}]))
        await click('button.apply')

        expect(applied().proportions).toMatchObject({skip: false, anticipatedProportions: [{stratum: 1, proportion: 0.4}]})
    })

    it('opened over answers the strata were reordered under, keep them as they are, asking nothing', async () => {
        const reordered = stratified({areas: 'areas', proportions: {manual: true, rows: [{stratum: 1, proportion: 0.5}, {stratum: 2, proportion: 0.2}]}})
        reordered.model.stratification.strata = [{value: 2, label: 'Other', color: '#0000aa', area: 100, weight: 0.5}, {value: 1, label: 'Original', color: '#00aa00', area: 100, weight: 0.5}]
        await open(Proportions, reordered, {digest: 'areas'})

        expect(harness.inputs.anticipatedProportions.value).toEqual([{stratum: 1, proportion: 50}, {stratum: 2, proportion: 20}])
        expect(marks()).not.toHaveProperty('proportions')
        expect(harness.calculations).toEqual([])
    })

    it('an earlier version flagged, though they answer for every stratum, are settled by Apply', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {manual: true, requiresUpdate: true}}), {digest: 'areas'})
        expect(marks()).toEqual({proportions: 'error'})

        await click('button.apply')

        expect('requiresUpdate' in applied().proportions).toBe(false)
        expect(applied().proportions.anticipatedProportions).toEqual([{stratum: 1, proportion: 0.5}])
        expect(marks()).not.toHaveProperty('proportions')
    })

    it('an earlier version flagged stay flagged when the panel is cancelled', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {manual: true, requiresUpdate: true}}), {digest: 'areas'})

        await click('button.cancel')

        expect(applied().proportions.requiresUpdate).toBe(true)
        expect(marks()).toEqual({proportions: 'error'})
    })

    it.each([
        ['Apply', () => button('button.apply').click()],
        ['Enter', () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))]
    ])('are refused by %s once the strata change under them before the panel renders again, saying so', async (_name, submit) => {
        await open(Proportions, stratified({areas: 'areas', proportions: {manual: true}}), {digest: 'areas'})
        await act(async () => harness.inputs.anticipatedProportions.set([{stratum: 1, proportion: 40}]))
        await settled()

        await act(async () => {
            actionBuilder('RESTRATIFIED')
                .set('process.loadedRecipes.design.model.stratification.strata', [{value: 2, label: 'Other', color: '#0000aa', area: 100, weight: 1}])
                .dispatch()
            submit()
        })
        await settled()

        expect(applied().proportions.anticipatedProportions).toEqual([{stratum: 1, proportion: 0.5}])
        expect(harness.proportions.feedback).toEqual({errorMessage: 'process.samplingDesign.sectionStatus.proportions.REQUIRES_UPDATE'})
    })
})

describe('proportions a client of the previous release saved', () => {
    it.each([
        ['with frame evidence alone', {legacyFrame: 'frame'}],
        ['beside full evidence a newer client recorded, though the sources read as it says', {frame: 'frame', legacyFrame: null}]
    ])('%s, are calculated once as the panel opens, and applied without that frame evidence', async (_name, proportions) => {
        await open(Proportions, unstratified(proportions), {})

        expect(harness.calculations).toHaveLength(1)

        await answer(probabilitiesAnswer({frame: 'frame'}))
        await click('button.apply')

        expect('stratumFrameEvidence' in applied().proportions).toBe(false)
        expect(applied().proportions.probabilityPerStratumCalculatedFrom.dependencies[PROBABILITY].digest).toBe('source')
    })

    it('keep that frame evidence through an Apply that calculates nothing', async () => {
        await open(Proportions, unstratified({frame: 'frame', legacyFrame: null}), null)
        await failEvidence()
        await act(async () => harness.inputs.anticipatedProportions.set([{stratum: 1, proportion: 40}]))

        await click('button.apply')

        expect(applied().proportions.anticipatedProportions).toEqual([{stratum: 1, proportion: 0.4}])
        expect(applied().proportions.stratumFrameEvidence).toBe(null)
    })
})

describe('a design no panel is open on', () => {
    it.each([
        ['the probability recipe', {'probability-1': 2}],
        ['a recipe the probability recipe reads', {'mosaic-1': 2}]
    ])('once %s changes, marks proportions alone and holds Retrieve, calculating nothing', async (_name, revisions) => {
        await open(NoPanel, stratified({areas: 'areas', proportions: {frame: 'areas'}, allocation: true}), {digest: 'areas'})
        expect(marks()).toEqual({})

        await relist(revisions, {source: {digest: 'changed'}})

        expect(marks()).toEqual({proportions: 'error'})
        expect(samplesGate(design(), Date.now())).not.toBe(null)
        expect(harness.calculations).toEqual([])
    })

    it('reopened over proportions whose probability source changed while it was closed, marks proportions alone', async () => {
        await open(NoPanel, stratified({areas: 'areas', proportions: {frame: 'areas'}, allocation: true}), {digest: 'areas', source: {digest: 'changed'}})

        expect(marks()).toEqual({proportions: 'error'})
    })
})

const PROBABILITIES = [{stratum: 1, probability: 0.25}]

// A design stratified by a classification, its areas calculated over a frame of this digest, or saved without
// evidence, its proportions skipped unless given, and its allocation, where asked for, reviewed over them.
const stratified = ({eeStrategy = 'ONLINE', areas, proportions, allocation}) => {
    const model = {
        aoi: AOI,
        stratification: {
            type: 'RECIPE', recipeId: 'classification-1', band: 'class', crs: 'EPSG:6933', scale: 30, eeStrategy,
            strata: [{value: 1, label: 'Original', color: '#00aa00', area: 100, weight: 1}]
        },
        proportions: {skip: true}
    }
    if (areas) {
        model.stratification.strataCalculatedFrom = areasFrom(frameOf(model, {digest: areas}))
    }
    if (proportions) {
        model.proportions = anticipated(model, proportions)
    }
    if (allocation) {
        model.sampleAllocation = {manual: [true], allocationStrategy: 'EQUAL', allocation: [{stratum: 1, sampleSize: 30}]}
        model.sampleAllocation.reviewedInputs = allocationReviewInputs(model)
    }
    return {sources: ['classification-1', ...SOURCE_RECIPES], model}
}

// A design whose stratification source and band are selected, its areas not calculated yet.
const selected = () => {
    const design = stratified({})
    delete design.model.stratification.strata
    return design
}

// An unstratified design over an AOI another recipe holds, its automatic proportions calculated over a frame of this
// digest, saved without evidence, or not calculated yet.
const unstratified = proportions => {
    const model = {
        aoi: {type: 'RECIPE', id: 'aoi-recipe'},
        stratification: {skip: true, crs: 'EPSG:6933', strata: [{value: 1, label: 'All', color: '#000000', weight: 1}]}
    }
    model.proportions = anticipated(model, proportions)
    return {sources: ['aoi-recipe', ...SOURCE_RECIPES], model}
}

// The probability recipe the proportions select, and a recipe it reads.
const SOURCE_RECIPES = ['probability-1', 'mosaic-1']

// Proportions anticipated from a probability recipe, calculated over a frame and probability source of these digests, or
// entered by hand - `manual` true for the form's toggle, or 'flag' as an earlier version saved it - `legacyFrame` the frame evidence
// a client of the previous release saved with them, null included, and `requiresUpdate` the flag an earlier version did.
const anticipated = (model, {frame, source = 'source', legacyFrame, rows, manual = false, empty = false, eeStrategy = 'ONLINE', requiresUpdate}) => {
    const proportions = {
        skip: false, manual: manual === 'flag' ? true : manual ? [true] : [], anticipationStrategy: 'PROBABILITY', type: 'RECIPE', recipeId: 'probability-1', band: 'p',
        scale: 30, eeStrategy, percentage: false, ...requiresUpdate !== undefined && {requiresUpdate},
        probabilityPerStratum: empty ? null : [{stratum: 1, probability: 0.5}],
        anticipatedProportions: empty ? null : rows || [{stratum: 1, proportion: 0.5}]
    }
    const design = {...model, proportions}
    return {
        ...proportions,
        ...(frame && {probabilityPerStratumCalculatedFrom: probabilitiesFrom(design, {frame, source})}),
        ...(legacyFrame !== undefined && {stratumFrameEvidence: legacyFrame && frameOf(design, {digest: legacyFrame})})
    }
}

// The frame's evidence as Earth Engine answers it for a model, read from the one recipe its sources name.
const frameOf = (model, {digest = 'frame', revision = 1, unversioned = []}) => ({
    dependency: FRAME, contractVersion: 1, question: stratumFrameQuestion(model), digest,
    provenance: {recipes: [{id: model.stratification.recipeId || model.aoi.id, revision}], assets: []}, unversioned
})

// The probability source's evidence as Earth Engine answers it for a model: the probability recipe and what it reads.
const sourceOf = (model, {digest = 'source', revision = 1, upstream = 1, unversioned = []} = {}) => ({
    dependency: PROBABILITY, contractVersion: 1, question: probabilitySourceQuestion(model), digest,
    provenance: {recipes: [{id: 'mosaic-1', revision: upstream}, {id: 'probability-1', revision}], assets: []}, unversioned
})

const areasFrom = evidence => ({
    resource: {id: 'SAMPLING_STRATUM_AREAS', contractVersion: 1}, question: {scale: 30}, dependencies: {[FRAME]: evidence}
})

const probabilitiesFrom = (model, {frame, source, sourceRevision = 1}) => ({
    resource: {id: 'SAMPLING_STRATUM_PROBABILITIES', contractVersion: 1},
    question: stratumProbabilitiesQuestion(model),
    dependencies: {[FRAME]: frameOf(model, {digest: frame}), [PROBABILITY]: sourceOf(model, {digest: source, revision: sourceRevision})}
})

// The probabilities as the operation answers them for the applied design, the frame again where older clients read it.
const probabilitiesAnswer = ({frame = 'frame', source = 'source', sourceRevision} = {}) => {
    const calculatedFrom = probabilitiesFrom(applied(), {frame, source, sourceRevision})
    return {probabilityPerStratum: PROBABILITIES, calculatedFrom, stratumFrameEvidence: calculatedFrom.dependencies[FRAME]}
}

// The design open in a session, its frame's current evidence answered as `current` says, or still being read.
const open = async (Panel, {sources, model}, current) => {
    const initial = {
        process: {
            loadedRecipes: {design: {id: 'design', type: 'SAMPLING_DESIGN', revision: 1, model, ui: {initialized: true}}},
            recipes: sources.map(id => ({id, revision: 1})), tabs: [{id: 'design'}], projects: [], saveStates: {}
        },
        dimensions: {width: 1024, height: 768}, assets: {user: [], other: []}
    }
    store = createStore((state = initial, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    harness.panel = Panel
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(view(Panel)))
    current ? await answerEvidence(current) : await settled()
}

const view = Panel =>
    <Provider store={store}>
        <SourceRuntimeProvider>
            <DesignEvidence/>
            <Recipe id='design'>
                <EventShield>
                    <PortalContainer/>
                    <PortalContainer id='panels'/>
                    <PortalContext id='panels'><Panel/></PortalContext>
                </EventShield>
            </Recipe>
        </SourceRuntimeProvider>
    </Provider>

// The design's own editor keeps its frame's evidence current while it is open.
const DesignEvidence = () => {
    const sourceRuntime = useSourceRuntime()
    React.useEffect(() => {
        const watch = sourceRuntime.watchDependencyEvidence$('design').subscribe()
        return () => watch.unsubscribe()
    }, [sourceRuntime])
    return null
}

// Every evidence read waiting is answered for the question it asked: the frame's at `digest` - that question's, or a
// function of it - and the probability source's as `source` says, at the revisions the listing holds unless told.
const answerEvidence = async ({digest = 'frame', revision = 1, unversioned = [], source = {}} = {}) => {
    await settled()
    const waiting = harness.evidenceReads.filter(read => !read.answered)
    await act(async () => waiting.forEach(read => {
        const {dependency, question} = read.body
        read.answered = true
        read.response$.next(dependency === PROBABILITY
            ? {...sourceOf(applied(), {revision: listed('probability-1'), upstream: listed('mosaic-1'), ...source}), question}
            : {...frameOf(applied(), {digest: _.isFunction(digest) ? digest(question) : digest, revision, unversioned}), question})
    }))
    await settled()
}

// The recipes the design reads are listed at a newer revision, and what read them is read again and answered for it.
const list = async (revision, {digest = 'frame'} = {}) => {
    await act(async () => actionBuilder('LISTED').set('process.recipes', harness.sources().map(id => ({id, revision}))).dispatch())
    await answerEvidence({digest, revision})
}

// Some recipes are listed at newer revisions, {[id]: revision}, and what read them is read again and answered.
const relist = async (revisions, answers) => {
    const recipes = store.getState().process.recipes.map(recipe => ({...recipe, revision: revisions[recipe.id] ?? recipe.revision}))
    await act(async () => actionBuilder('LISTED').set('process.recipes', recipes).dispatch())
    await answerEvidence(answers)
}

const listed = id => store.getState().process.recipes.find(recipe => recipe.id === id)?.revision ?? 1

harness.sources = () => store.getState().process.recipes.map(({id}) => id)

const answer = async response => {
    await settled()
    await act(async () => {
        harness.calculations.at(-1).response$.next(response)
        harness.calculations.at(-1).response$.complete()
    })
    const {[FRAME]: frame, [PROBABILITY]: source} = response.calculatedFrom.dependencies
    await answerEvidence({digest: frame.digest, source: source ? {digest: source.digest} : {}})
}

// Every evidence read waiting fails.
const failEvidence = async () => {
    await settled()
    const waiting = harness.evidenceReads.filter(read => !read.answered)
    await act(async () => waiting.forEach(read => {
        read.answered = true
        read.response$.error(new Error('Unreadable'))
    }))
    await settled()
}

const fail = async error => {
    await settled()
    await act(async () => harness.calculations.at(-1).response$.error(error))
    await settled()
}

const design = () => store.getState().process.loadedRecipes.design

const applied = () => design().model

// Each section the toolbar marks, as unfinished or wrong.
const marks = () => {
    const {sourceProblems, incompleteSections} = sectionProblemsOfState(store.getState(), 'design', null, Date.now())
    return Object.fromEntries(Object.keys(sourceProblems).map(section => [section, incompleteSections[section] ? 'incomplete' : 'error']))
}

// The design open with none of its panels.
const NoPanel = () => null

// The design as the Stratification panel's edited CRS would leave it, and the digest of each frame it reads.
const edited = () => ({...applied(), stratification: {...applied().stratification, crs: 'EPSG:32631'}})

const EDITED_FRAME = question => question.crs === 'EPSG:32631' ? 'edited' : 'frame'

const text = () => document.body.textContent

const button = label => [...document.querySelectorAll('button')].find(element => element.textContent === label)

const click = async label => {
    await act(async () => button(label).click())
    await settled()
}

const type = async (label, value) => {
    const input = document.querySelector(`[data-label="${label}"] input`)
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

const submitForm = async () => {
    await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})))
    await settled()
}

const settled = async () => {
    for (let i = 0; i < 5; i++) {
        await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
    }
}
