import {describe, expect, it, vi} from 'vitest'

// The Retrieve panel of CCDC Slice, on what it offers and what it lets through.
//
// The measures a base band carries come from the description in force. An observation spells them one way
// and a recipe saved by an older GUI another, and the panel must offer the same controls for both - reading
// only one of the two spellings is what left a real observation with no measure options at all.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))

const notified = vi.hoisted(() => [])
vi.mock('~/widget/notifications', () => ({Notifications: {error: message => notified.push(message)}}))

const submitted = vi.hoisted(() => [])
vi.mock('../../ccdcSliceRecipe', () => ({
    RecipeActions: () => ({retrieve: values => ({dispatch: () => submitted.push(values)})})
}))

vi.mock('~/app/home/body/process/recipeFormPanel', () => ({
    RecipeFormPanel: () => null,
    recipeFormPanel: () => Component => Component
}))

vi.mock('~/app/home/body/process/recipeList/projectActions', () => ({updateProject: () => {}}))

const {Retrieve} = await import('./retrieve')
const {mapRecipeToProps} = await import('./retrieve')

const DESCRIBED = {
    bands: ['ndvi_coefs', 'ndvi_rmse', 'tStart'],
    baseBands: [{name: 'ndvi', measures: ['value', 'rmse']}],
    segmentBands: [{name: 'tStart'}],
    dateFormat: 1,
    visualizations: []
}

const sliceOf = ({sourceEvidence, source, options} = {}) => ({
    id: 'slice-1',
    type: 'CCDC_SLICE',
    projectId: null,
    model: {
        source: source || {type: 'RECIPE_REF', id: 'ccdc-1'},
        date: {dateType: 'SINGLE', date: '2020-06-01'},
        options: options || {gapStrategy: 'MASK', harmonics: 3}
    },
    ...(sourceEvidence ? {ui: {sourceEvidence}} : {})
})

const observed = segments => ({sourceKey: 'RECIPE_REF:ccdc-1', status: 'OBSERVED', segments})

const panel = recipe => {
    const props = mapRecipeToProps(recipe)
    const inputs = {
        baseBands: {value: []}, bandTypes: {value: []}, segmentBands: {value: []},
        scale: {value: 30, set: () => {}}, destination: {value: 'GEE'}, assetType: {value: 'Image'}
    }
    const instance = new Retrieve({...props, inputs, projects: [], form: {isInvalid: () => false}})
    instance.setState = state => Object.assign(instance.state, state)
    return instance
}

const measureOptions = instance =>
    instance.renderBandTypes().props.options.map(({value}) => value)

describe('the measures a base band offers', () => {
    it('are those the observed description says it carries', () => {
        expect(measureOptions(panel(sliceOf({sourceEvidence: observed(DESCRIBED)}))))
            .toEqual(['value', 'rmse'])
    })

    // A copy an older GUI saved spelled them `bandTypes`. Normalized where the copy enters, so the panel
    // reads one shape.
    it('are the same for a recipe saved before that description existed', () => {
        const copied = sliceOf({
            source: {
                type: 'RECIPE_REF', id: 'ccdc-1',
                bands: ['ndvi_coefs', 'ndvi_rmse', 'tStart'],
                baseBands: [{name: 'ndvi', bandTypes: ['value', 'rmse']}],
                segmentBands: [{name: 'tStart'}]
            }
        })

        expect(measureOptions(panel(copied))).toEqual(['value', 'rmse'])
    })

    // Break confidence is derived from a magnitude and a residual; a source fitting neither cannot offer it.
    it('exclude one the source does not carry', () => {
        expect(measureOptions(panel(sliceOf({sourceEvidence: observed(DESCRIBED)}))))
            .not.toContain('magnitude')
    })
})

// Which bands a slice produces depends on the operation it performs, so what it can export does too. A
// source may have fitted three harmonics and this slice still produce none.
describe('the measures a slice interpolating without harmonics offers', () => {
    const FITTED = [
        'value', 'intercept', 'slope',
        'phase_1', 'amplitude_1', 'phase_2', 'amplitude_2', 'phase_3', 'amplitude_3',
        'rmse', 'magnitude'
    ]
    const fullyFitted = {
        bands: ['ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude', 'tStart'],
        baseBands: [{name: 'ndvi', measures: FITTED}],
        segmentBands: [{name: 'tStart'}],
        visualizations: []
    }
    const interpolating = harmonics => sliceOf({
        sourceEvidence: observed(fullyFitted),
        options: {gapStrategy: 'INTERPOLATE', harmonics}
    })

    it('exclude phase and amplitude', () => {
        expect(measureOptions(panel(interpolating(0))))
            .toEqual(['value', 'rmse', 'magnitude', 'breakConfidence', 'intercept', 'slope'])
    })

    it('include as many harmonics as the slice is asked for', () => {
        expect(measureOptions(panel(interpolating(2)))).toEqual([
            'value', 'rmse', 'magnitude', 'breakConfidence', 'intercept', 'slope',
            'phase_1', 'phase_2', 'amplitude_1', 'amplitude_2'
        ])
    })
})

describe('an open panel whose source became unreachable', () => {
    const unreachable = sliceOf({sourceEvidence: {sourceKey: 'RECIPE_REF:ccdc-1', status: 'UNAVAILABLE'}})

    it('cannot be applied', () => {
        expect(mapRecipeToProps(unreachable).outputUnavailable).toBe(true)
    })

    it('submits nothing if applied anyway', () => {
        submitted.length = 0
        notified.length = 0
        const instance = panel(unreachable)

        instance.retrieve({baseBands: ['ndvi'], bandTypes: ['value'], segmentBands: []})

        expect(submitted).toEqual([])
        expect(notified).toHaveLength(1)
    })
})

describe('a selection this recipe cannot produce', () => {
    it('is not submitted', () => {
        submitted.length = 0
        notified.length = 0
        const instance = panel(sliceOf({sourceEvidence: observed(DESCRIBED)}))

        instance.retrieve({baseBands: ['nbr'], bandTypes: ['value'], segmentBands: []})

        expect(submitted).toEqual([])
        expect(notified).toHaveLength(1)
    })

    it('is submitted once it names bands the operation produces', () => {
        submitted.length = 0
        const instance = panel(sliceOf({sourceEvidence: observed(DESCRIBED)}))

        instance.retrieve({baseBands: ['ndvi'], bandTypes: ['value', 'rmse'], segmentBands: ['tStart']})

        expect(submitted).toHaveLength(1)
    })
})
