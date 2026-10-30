import _ from 'lodash'
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {stratumFrameQuestion} from '#sepal/recipe/samplingDesign/stratumFrame'
import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, useSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// The stratum areas and automatic proportions Sampling Design's panels calculate as they open and as they are edited:
// answered, failed, answered late or over other inputs, and applied by Apply, Enter or a set-up wizard's Next, or
// cancelled. The panels, their form panel and its
// calculation binding, the store and the source runtime the app composes over it are real, the design's frame evidence
// watched as its editor watches it; Earth Engine, the panel chrome's activation, the pickers and the tables are
// substituted.

const harness = vi.hoisted(() => ({frameReads: [], calculations: [], wizard: null, inputs: {}}))

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
                dependencyEvidence$: read(harness.frameReads),
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
    ProportionsHeaderButtons: () => null,
    StrataProportion: ({anticipatedProportions, calculationError, feedback, emptyMessage}) => {
        harness.inputs.anticipatedProportions = anticipatedProportions
        harness.proportions = {calculationError, feedback, emptyMessage}
        return null
    }
}))

const {samplingDesignRequirements} = await import('../freshnessRequirements')
const {samplingDesignCalculations} = await import('../calculations')
const {Stratification} = await import('./stratification/stratification')
const {Proportions} = await import('./proportions/proportions')

harness.type = {sourceRequirements: samplingDesignRequirements, calculatedResults: samplingDesignCalculations}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const FRAME = 'SAMPLING_STRATUM_FRAME'
const AOI = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]}

let store, root, container

beforeEach(() => {
    harness.frameReads.length = 0
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

        await answerFrames({digest: 'after'})

        expect(harness.calculations).toHaveLength(1)
    })

    it('says it is checking the frame in place of areas not calculated yet', async () => {
        await open(Stratification, selected(), null)

        expect(text()).toContain('process.samplingDesign.panel.stratification.form.result.checking')
        expect(text()).not.toContain('process.samplingDesign.panel.stratification.form.strata.noData')
    })

    it('asks nothing for areas while the frame cannot be read', async () => {
        await open(Stratification, selected(), null)

        await failFrames()

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
        await answerFrames()

        expect(harness.calculations).toHaveLength(1)
    })

    it('opened over current areas, asks nothing, also once a revision leaving their frame the same is read', async () => {
        await open(Stratification, stratified({areas: 'frame'}), {})

        await list(2)

        expect(harness.frameReads.length).toBeGreaterThan(1)
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
        await answerFrames({digest: EDITED_FRAME})
        await answer({groups: [{stratum: 1, area: 200}], calculatedFrom: areasFrom(frameOf(edited(), {digest: 'edited'}))})

        await list(2, {digest: EDITED_FRAME})
        await click('button.apply')

        expect(harness.calculations).toHaveLength(1)
        expect(applied().stratification).toMatchObject({crs: 'EPSG:32631', strata: [{area: 200}]})
    })
})

describe('the Proportions panel', () => {
    it.each([['ONLINE', false], ['BATCH', true]])('opened %s over proportions marked for update, calculates them in that mode over the current areas', async (eeStrategy, batch) => {
        await open(Proportions, stratified({areas: 'after', proportions: {requiresUpdate: true, frame: 'after', eeStrategy}}), {digest: 'after'})

        expect(harness.calculations.map(({body}) => _.pick(body, ['batch', 'evidence']))).toEqual([{batch, evidence: true}])
    })

    it.each([
        ['not calculated yet', {empty: true}],
        ['saved without evidence', {}]
    ])('opened over proportions %s, waits for the frame\'s evidence, and calculates them once it is read', async (_name, proportions) => {
        await open(Proportions, unstratified(proportions), null)

        expect(harness.calculations).toEqual([])

        await answerFrames({digest: 'aoi'})

        expect(harness.calculations).toHaveLength(1)
    })

    it('asks nothing for proportions not calculated yet while the frame cannot be read', async () => {
        await open(Proportions, unstratified({empty: true}), null)

        await failFrames()

        expect(harness.calculations).toEqual([])
        expect(harness.proportions.emptyMessage).toBe('process.samplingDesign.retrieve.evidence.SOURCE_UNAVAILABLE')
    })

    it('asks nothing for proportions not calculated yet over a frame that cannot report replacement', async () => {
        await open(Proportions, unstratified({empty: true}), {unversioned: ['gs://bucket/aoi.tif']})

        expect(harness.calculations).toEqual([])
        expect(harness.proportions.emptyMessage).toBe('process.samplingDesign.panel.proportions.form.result.UNVERSIONED')
    })

    it('opened over current proportions, asks nothing', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {frame: 'areas'}}), {digest: 'areas'})

        expect(harness.calculations).toEqual([])
    })

    it('calculates proportions again for an edited Scale, though their frame is the same', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {frame: 'areas'}}), {digest: 'areas'})

        await act(async () => harness.inputs.scale.set(60))
        await settled()

        expect(harness.calculations.map(({body}) => body.scale)).toEqual([60])
    })

    it('opened over manual proportions, asks nothing', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {manual: true}}), {digest: 'areas'})

        expect(harness.calculations).toEqual([])
    })

    it('asks nothing while the areas are still being checked, and calculates once they are current', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {}}), null)

        expect(harness.calculations).toEqual([])

        await answerFrames({digest: 'areas'})

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

        await answer({probabilityPerStratum: PROBABILITIES, stratumFrameEvidence: frameOf(applied(), {digest: 'another frame'})})

        expect(harness.proportions.calculationError.message).toBe('process.samplingDesign.panel.proportions.form.result.superseded')
        expect(harness.inputs.anticipatedProportions.value).toEqual(opened)
        expect(harness.calculations).toHaveLength(1)
    })

    it('takes probabilities over the frame the current areas were calculated from, with that evidence', async () => {
        await open(Proportions, stratified({areas: 'areas', proportions: {}}), {digest: 'areas'})

        await answer({probabilityPerStratum: PROBABILITIES, stratumFrameEvidence: frameOf(applied(), {digest: 'areas'})})
        await click('button.apply')

        expect(applied().proportions.stratumFrameEvidence.digest).toBe('areas')
        expect(applied().proportions.probabilityPerStratum).toEqual(PROBABILITIES)
    })

    it('takes an unstratified design\'s probabilities over its AOI and CRS, without any area evidence', async () => {
        await open(Proportions, unstratified({}), {})

        await answer({probabilityPerStratum: PROBABILITIES, stratumFrameEvidence: frameOf(applied(), {digest: 'aoi'})})
        await click('button.apply')

        expect(harness.calculations[0].body).toMatchObject({stratification: null, evidence: true})
        expect(applied().proportions.stratumFrameEvidence.digest).toBe('aoi')
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
})

const PROBABILITIES = [{stratum: 1, probability: 0.25}]

// A design stratified by a classification, its areas calculated over a frame of this digest, or saved without
// evidence, and its proportions skipped unless given.
const stratified = ({eeStrategy = 'ONLINE', areas, proportions}) => {
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
    return {sources: ['classification-1'], model}
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
    return {sources: ['aoi-recipe'], model}
}

// Proportions anticipated from a probability image, or entered by hand.
const anticipated = (model, {requiresUpdate = false, frame, manual = false, empty = false, eeStrategy = 'ONLINE'}) => ({
    skip: false, manual: manual ? [true] : [], anticipationStrategy: 'PROBABILITY', type: 'ASSET', assetId: 'users/x/probability', band: 'p',
    scale: 30, eeStrategy, percentage: false, requiresUpdate,
    probabilityPerStratum: empty ? null : [{stratum: 1, probability: 0.5}],
    anticipatedProportions: empty ? null : [{stratum: 1, proportion: 0.5}],
    ...(frame && {stratumFrameEvidence: frameOf(model, {digest: frame})})
})

// The frame's evidence as Earth Engine answers it for a model, read from the one recipe its sources name.
const frameOf = (model, {digest = 'frame', revision = 1, unversioned = []}) => ({
    dependency: FRAME, contractVersion: 1, question: stratumFrameQuestion(model), digest,
    provenance: {recipes: [{id: model.stratification.recipeId || model.aoi.id, revision}], assets: []}, unversioned
})

const areasFrom = evidence => ({
    resource: {id: 'SAMPLING_STRATUM_AREAS', contractVersion: 1}, question: {scale: 30}, dependencies: {[FRAME]: evidence}
})

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
    current ? await answerFrames(current) : await settled()
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

// Every frame evidence read waiting is answered for the question it asked, `digest` that question's or a function of it.
const answerFrames = async ({digest = 'frame', revision = 1, unversioned = []} = {}) => {
    await settled()
    const waiting = harness.frameReads.filter(read => !read.answered)
    await act(async () => waiting.forEach(read => {
        const {question} = read.body
        read.answered = true
        read.response$.next({...frameOf(applied(), {digest: _.isFunction(digest) ? digest(question) : digest, revision, unversioned}), question})
    }))
    await settled()
}

// The recipe the frame reads is listed at a newer revision, and the frame read again answers for it.
const list = async (revision, {digest = 'frame'} = {}) => {
    await act(async () => actionBuilder('LISTED').set('process.recipes', harness.sources().map(id => ({id, revision}))).dispatch())
    await answerFrames({digest, revision})
}

harness.sources = () => store.getState().process.recipes.map(({id}) => id)

const answer = async response => {
    await settled()
    await act(async () => {
        harness.calculations.at(-1).response$.next(response)
        harness.calculations.at(-1).response$.complete()
    })
    await answerFrames({digest: response.calculatedFrom?.dependencies[FRAME].digest ?? response.stratumFrameEvidence.digest})
}

const failFrames = async () => {
    await settled()
    const waiting = harness.frameReads.filter(read => !read.answered)
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

const applied = () => store.getState().process.loadedRecipes.design.model

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
