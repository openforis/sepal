import _ from 'lodash'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {allocationReviewInputs, allocationReviewState} from '#sepal/recipe/samplingDesign/allocationReview'
import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import lookStyles from '~/style/look.module.css'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// The sample allocation the Allocation panel shows and applies: derived in its draft from the design as the edit would
// leave it, with the record of what it was derived from, whenever the design's inputs are not those it was reviewed for -
// as it opens, as it is edited and as what it reads changes under it - and applied by Apply or Enter, or cancelled. The
// panel, its form panel and derivation binding, the requirements and the store are real; the panel chrome's activation
// and the allocation table are substituted, the table showing the rows and uncertainty it is given.

const harness = vi.hoisted(() => ({wizard: null, table: null}))

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/apiRegistry', () => ({default: {gee: {assetVersions$: () => NEVER}, recipe: {loadAll$: () => NEVER}}}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: () => harness.type, isImageSource: () => true
}))
vi.mock('~/widget/panelWizard', () => ({
    withPanelWizard: () => Component => props => <Component {...props} panelWizard={harness.wizard}/>
}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => <Component {...props} activatable={{active: true, deactivate: () => {}}}/>
}))
vi.mock('./allocationTable', () => ({AllocationTable: ({allocation, marginOfError, manual}) => {
    harness.table = {allocation, marginOfError, manual}
    return null
}}))

const {samplingDesignRequirements} = await import('../../freshnessRequirements')
const {samplingDesignDerivations} = await import('../../derivations')
const {allocationOutcome, marginOfErrorFor} = await import('../../sampling/allocationOutcome')
const {getDefaultSampleAllocation} = await import('../../sampling/defaultModel')
const {SampleAllocation} = await import('./sampleAllocation')

harness.type = {sourceRequirements: samplingDesignRequirements, derivedResults: samplingDesignDerivations}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let store, root, container

beforeEach(() => {
    harness.wizard = {next: vi.fn()}
    harness.table = null
})

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
    root = container = null
})

describe('an allocation opened over a design it was not reviewed for', () => {
    it.each([
        ['Equal', {allocationStrategy: 'EQUAL'}],
        ['Proportional', {allocationStrategy: 'PROPORTIONAL'}],
        ['Balanced', {allocationStrategy: 'BALANCED'}],
        ['Optimal', {allocationStrategy: 'OPTIMAL'}],
        ['Power', {allocationStrategy: 'POWER'}],
        ['Optimal, the total solved for a margin of error', {allocationStrategy: 'OPTIMAL', estimateSampleSize: true, marginOfError: 5}]
    ])('is derived in the draft, as %s allocation calculates it, and applied with the record of what it was derived from', async (_name, settings) => {
        const model = design({sampleAllocation: settings})
        await open(model)

        const expected = allocationOutcome(model)
        expect(harness.table.allocation.value).toEqual(expected.allocation)
        expect(harness.table.marginOfError).toEqual('marginOfError' in expected ? expected.marginOfError : model.sampleAllocation.marginOfError)

        await click('button.apply')

        expect(applied().sampleAllocation).toMatchObject(expected)
        expect(applied().sampleAllocation.reviewedInputs).toEqual(allocationReviewInputs(applied()))
        expect(allocationReviewState(applied())).toBe('REVIEWED')
    })

    it('saved without a record, keeps what was saved, still unreviewed, when the panel is cancelled', async () => {
        const saved = design({sampleAllocation: {allocation: [{stratum: 1, sampleSize: 10}, {stratum: 2, sampleSize: 90}]}})
        await open(saved)

        await click('button.cancel')

        expect(applied().sampleAllocation).toEqual(saved.sampleAllocation)
        expect(allocationReviewState(applied())).toBe('UNREVIEWED')
    })

    it.each([false, true])('applied last by an earlier version, its flag %s, is derived again though its record reads as the design does, and applied without the flag', async flag => {
        const reviewedThen = reviewed(design())
        await open({...reviewedThen, sampleAllocation: {...reviewedThen.sampleAllocation, requiresUpdate: flag}})
        expect(allocationReviewState(applied())).toBe('UNTRUSTED')

        await click('button.apply')

        expect('requiresUpdate' in applied().sampleAllocation).toBe(false)
        expect(allocationReviewState(applied())).toBe('REVIEWED')
    })
})

describe('an allocation saved before its settings existed', () => {
    it.each([
        ['no strategy', {allocationStrategy: undefined}, ['allocationStrategy']],
        ['a strategy nobody recognizes', {allocationStrategy: 'NONSENSE'}, ['allocationStrategy']],
        ['no target mode, confidence level, minimum or tuning constant',
            {estimateSampleSize: undefined, confidenceLevel: undefined, minSamplesPerStratum: undefined, powerTuningConstant: undefined},
            ['estimateSampleSize', 'confidenceLevel', 'minSamplesPerStratum', 'powerTuningConstant']]
    ])('with %s, opens on the defaults a new one starts with, derived over them, and is applied with them', async (_name, missing, defaulted) => {
        await open(design({sampleAllocation: missing}))

        await click('button.apply')

        expect(applied().sampleAllocation).toMatchObject(_.pick(getDefaultSampleAllocation(), defaulted))
        expect(applied().sampleAllocation.allocation).toEqual(allocationOutcome(applied()).allocation)
        expect(allocationReviewState(applied())).toBe('REVIEWED')
    })
})

describe('an allocation saved with a setting of zero', () => {
    it('keeps it as saved, a value rather than a blank, and is derived over it', async () => {
        await open(design({sampleAllocation: {allocationStrategy: 'POWER', powerTuningConstant: 0}}))

        await click('button.apply')

        expect(applied().sampleAllocation.powerTuningConstant).toBe(0)
        expect(applied().sampleAllocation.allocation).toEqual(allocationOutcome(applied()).allocation)
        expect(applied().sampleAllocation.reviewedInputs.powerTuningConstant).toBe(0)
    })
})

describe('an allocation opened over the design it allocates', () => {
    it('of a single stratum, is allocated by hand', async () => {
        const single = design()
        single.stratification.strata = [single.stratification.strata[0]]
        single.proportions.anticipatedProportions = [single.proportions.anticipatedProportions[0]]
        await open(single)

        expect(harness.table.manual).toBeTruthy()
    })

    it('without proportions, fixes its total and leaves no margin of error to estimate it from', async () => {
        const skipped = design({sampleAllocation: {allocationStrategy: 'EQUAL', estimateSampleSize: true, marginOfError: 5}})
        skipped.proportions = {skip: true}
        await open(skipped)

        await click('button.apply')

        expect(applied().sampleAllocation).toMatchObject({estimateSampleSize: false, marginOfError: null, sampleSize: 100})
        expect(applied().sampleAllocation.allocation).toEqual(allocationOutcome(applied()).allocation)
    })
})

// The Target reads as a total or a margin of error by the mode chosen beside it, so the mode is always shown.
describe('the target mode', () => {
    it('without proportions, is shown fixed at Samples, Error unavailable, and a fixed total with no margin of error applies', async () => {
        await open(withSkip(design({sampleAllocation: {marginOfError: null}}), true))

        expect(targetModes()).toEqual([
            {mode: ERROR, selected: false, disabled: true},
            {mode: SAMPLES, selected: true, disabled: false}
        ])

        await click('button.apply')

        expect(applied().sampleAllocation).toMatchObject({estimateSampleSize: false, sampleSize: 100, marginOfError: null})
        expect(allocationReviewState(applied())).toBe('REVIEWED')
    })

    it('with proportions again, offers both, Samples kept as applied without them until Error is chosen', async () => {
        await open(design({sampleAllocation: {estimateSampleSize: false, marginOfError: null}}))

        expect(targetModes()).toEqual([
            {mode: ERROR, selected: false, disabled: false},
            {mode: SAMPLES, selected: true, disabled: false}
        ])

        await click(ERROR)

        expect(targetModes()).toEqual([
            {mode: ERROR, selected: true, disabled: false},
            {mode: SAMPLES, selected: false, disabled: false}
        ])
    })
})

describe('an allocation reviewed for the design as it is', () => {
    it('opens as it was applied, the panel unedited', async () => {
        const saved = reviewed(design())
        await open(saved)

        expect(harness.table.allocation.value).toEqual(saved.sampleAllocation.allocation)
        expect(store.getState().process.loadedRecipes.design.ui.sampleAllocation?.dirty).toBeFalsy()
    })

    it('is derived again for an edited total, and applied with a record of that total', async () => {
        await open(reviewed(design()))

        await type('process.samplingDesign.panel.sampleAllocation.form.target.label', '200')
        await click('button.apply')

        expect(applied().sampleAllocation.allocation).toEqual(allocationOutcome(applied()).allocation)
        expect(applied().sampleAllocation.reviewedInputs.sampleSize).toBe(200)
    })

    it.each([
        ['Apply', () => button('button.apply').click()],
        ['Enter', () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))]
    ])('edited, is refused by %s once the weights it reads change under it before the panel renders again, and shown derived anew', async (_name, submit) => {
        await open(reviewed(design()))
        await type('process.samplingDesign.panel.sampleAllocation.form.target.label', '200')
        const shown = harness.table.allocation.value

        await act(async () => {
            actionBuilder('REWEIGHED').set('process.loadedRecipes.design.model.stratification.strata', REWEIGHED).dispatch()
            submit()
        })
        await settled()

        expect(applied().sampleAllocation.sampleSize).toBe(100)
        expect(harness.table.allocation.value).not.toEqual(shown)

        await click('button.apply')

        expect(applied().sampleAllocation.allocation).toEqual(allocationOutcome(applied()).allocation)
        expect(allocationReviewState(applied())).toBe('REVIEWED')
    })

    it('edited, keeps what was applied and its record when the panel is cancelled', async () => {
        const saved = reviewed(design())
        await open(saved)
        await type('process.samplingDesign.panel.sampleAllocation.form.target.label', '200')

        await click('button.cancel')

        expect(applied().sampleAllocation).toEqual(saved.sampleAllocation)
        expect(allocationReviewState(applied())).toBe('REVIEWED')
    })
})

// Skip is saved as a boolean or as the form's toggle: false, an empty toggle and absence leave proportions applicable, true
// and a set toggle skip them.
describe('an allocation over proportions, however their skip was saved', () => {
    it.each([
        ['an empty toggle', [], 'PROPORTIONAL'],
        ['absent', undefined, 'PROPORTIONAL'],
        ['false', false, 'PROPORTIONAL'],
        ['an empty toggle', [], 'OPTIMAL'],
        ['absent', undefined, 'OPTIMAL']
    ])('not skipped, saved as %s, is derived and recorded as over proportions by %s allocation, its uncertainty finite', async (_name, skip, allocationStrategy) => {
        const expected = derivedOver(withSkip(design({sampleAllocation: {allocationStrategy}}), false))
        await open(withSkip(design({sampleAllocation: {allocationStrategy}}), skip))

        await click('button.apply')

        expect(applied().sampleAllocation).toMatchObject(_.pick(expected.sampleAllocation, ['allocationStrategy', 'allocation', 'marginOfError', 'reviewedInputs']))
        expect(Number.isFinite(applied().sampleAllocation.marginOfError)).toBe(true)
        expect(allocationReviewState(applied())).toBe('REVIEWED')
    })

    it.each([
        ['a set toggle', [true]],
        ['true', true]
    ])('skipped, saved as %s, is derived and recorded over the strata alone, its total fixed and no uncertainty shown', async (_name, skip) => {
        const expected = derivedOver(withSkip(design({sampleAllocation: {allocationStrategy: 'PROPORTIONAL', marginOfError: null}}), true))
        await open(withSkip(design({sampleAllocation: {allocationStrategy: 'PROPORTIONAL', estimateSampleSize: true}}), skip))

        await click('button.apply')

        expect(applied().sampleAllocation).toMatchObject({
            estimateSampleSize: false, marginOfError: null,
            ..._.pick(expected.sampleAllocation, ['allocation', 'reviewedInputs'])
        })
        expect(allocationReviewState(applied())).toBe('REVIEWED')
    })
})

describe('manual counts', () => {
    it('saved as an earlier version\'s flag, reordered with their strata, keep each count with its stratum, and the uncertainty is derived from them', async () => {
        const saved = design({sampleAllocation: {manual: true, allocation: [{stratum: 1, sampleSize: 30}, {stratum: 2, sampleSize: 70}]}})
        saved.stratification.strata = [...saved.stratification.strata].reverse()
        await open(saved)

        const reconciled = [{stratum: 2, sampleSize: 70}, {stratum: 1, sampleSize: 30}]
        expect(harness.table.manual).toBeTruthy()
        expect(harness.table.allocation.value).toEqual(reconciled)
        expect(harness.table.marginOfError).toBe(marginOfErrorFor({...saved, sampleAllocation: {...saved.sampleAllocation, allocation: reconciled}}))

        await click('button.apply')

        expect(applied().sampleAllocation).toMatchObject({manual: [true], allocation: reconciled})
        expect(allocationReviewState(applied())).toBe('REVIEWED')
    })
})

// A stratified design of two strata with anticipated proportions, its allocation automatic, fixed at a total of 100 and
// saved without counts unless told otherwise.
const design = ({sampleAllocation = {}} = {}) => ({
    aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
    stratification: {
        type: 'ASSET', assetId: 'users/x/strata', band: 'class', crs: 'EPSG:6933', scale: 30,
        strata: [
            {value: 1, label: 'Forest', color: '#00aa00', area: 600, weight: 0.6},
            {value: 2, label: 'Water', color: '#0000aa', area: 400, weight: 0.4}
        ]
    },
    proportions: {skip: false, manual: [true], anticipatedProportions: [{stratum: 1, proportion: 0.1}, {stratum: 2, proportion: 0.3}]},
    sampleAllocation: {
        manual: [], estimateSampleSize: false, allocationStrategy: 'OPTIMAL', sampleSize: 100, marginOfError: 10,
        confidenceLevel: 95, minSamplesPerStratum: '2', powerTuningConstant: '0.5', allocation: [],
        ...sampleAllocation
    }
})

const withSkip = (model, skip) => {
    const {skip: _skip, ...proportions} = model.proportions
    return {...model, proportions: skip === undefined ? proportions : {...proportions, skip}}
}

// The allocation derived for a design by the shared rules alone, with the record of what it read.
const derivedOver = model => {
    const derived = {...model, sampleAllocation: {...model.sampleAllocation, ...allocationOutcome(model)}}
    return {...derived, sampleAllocation: {...derived.sampleAllocation, reviewedInputs: allocationReviewInputs(derived)}}
}

const REWEIGHED = [
    {value: 1, label: 'Forest', color: '#00aa00', area: 300, weight: 0.3},
    {value: 2, label: 'Water', color: '#0000aa', area: 700, weight: 0.7}
]

// As the Allocation panel applies it: derived, with the record of what it was derived from.
const reviewed = model => {
    const derived = {...model, sampleAllocation: {...model.sampleAllocation, ...allocationOutcome(model)}}
    return {...derived, sampleAllocation: {...derived.sampleAllocation, reviewedInputs: allocationReviewInputs(derived)}}
}

const open = async model => {
    const initial = {
        process: {
            loadedRecipes: {design: {id: 'design', type: 'SAMPLING_DESIGN', revision: 1, model, ui: {initialized: true}}},
            recipes: [], tabs: [{id: 'design'}], projects: [], saveStates: {}
        },
        dimensions: {width: 1024, height: 768}, assets: {user: [], other: []}
    }
    store = createStore((state = initial, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Recipe id='design'>
                    <EventShield>
                        <PortalContainer/>
                        <PortalContainer id='panels'/>
                        <PortalContext id='panels'><SampleAllocation/></PortalContext>
                    </EventShield>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

const applied = () => store.getState().process.loadedRecipes.design.model

const button = label => [...document.querySelectorAll('button')].find(element => element.textContent === label)

const ERROR = 'process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.true.label'
const SAMPLES = 'process.samplingDesign.panel.sampleAllocation.form.estimateSampleSize.false.label'

// The Target's mode buttons shown: which is chosen, and which cannot be.
const targetModes = () => [...document.querySelectorAll('button')]
    .filter(element => [ERROR, SAMPLES].includes(element.textContent))
    .map(element => ({mode: element.textContent, selected: element.classList.contains(lookStyles.highlight), disabled: element.disabled}))

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

const settled = async () => {
    for (let i = 0; i < 5; i++) {
        await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
    }
}
