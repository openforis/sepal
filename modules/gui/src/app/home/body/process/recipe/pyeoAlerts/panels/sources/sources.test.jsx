import {of, throwError} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// What the Sources panel does with a classification, and what it hands the imagery reader.
//
// The panel owns the classification: its legend, and the rule that exactly one input image can be derived
// from. The imagery reader owns everything about that image. What this proves is the handoff between them -
// which source is read, and what survives when reading it fails.
//
// `compose` is the identity here, so the export is the class and its methods can be driven directly. The
// reader, the recipe read and Earth Engine are the substitutes; the panel's own logic is real.

vi.mock('~/compose', () => ({compose: Component => Component, composeHoC: () => Component => Component}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/form', () => {
    class Field {
        notEmpty() { return this }
        predicate() { return this }
    }
    return {Form: {Field}}
})

const notifyError = vi.fn()
vi.mock('~/widget/notifications', () => ({Notifications: {error: (...args) => notifyError(...args)}}))

const readInputImagery$ = vi.fn()
vi.mock('../../inputImagery', async importOriginal => ({
    ...await importOriginal(),
    readInputImagery$: (...args) => readInputImagery$(...args)
}))

const {Sources} = await import('./sources')

const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const TRAINING = 'training-1'

describe('a classification the user has just selected', () => {
    // Its training data is not its imagery. A training recipe that no longer exists must not stop the
    // panel reading the imagery the classification was trained on.
    it('reads the imagery it names, not the classification that named it', () => {
        const {panel} = sources()

        panel.onClassificationSelected(CLASSIFICATION)

        expect(readInputImagery$).toHaveBeenCalledTimes(1)
        const [reference] = readInputImagery$.mock.calls[0]
        expect(reference).toEqual({type: 'RECIPE_REF', id: MOSAIC})
        expect(loadRecipe$.mock.calls.map(([id]) => id)).toEqual([CLASSIFICATION])
        expect(loadRecipe$).not.toHaveBeenCalledWith(TRAINING)
    })

    it('asks for its configuration, as opening a saved recipe does not', () => {
        const {panel} = sources()

        panel.onClassificationSelected(CLASSIFICATION)
        expect(readInputImagery$.mock.calls[0][2]).toEqual({defaults: true})

        readInputImagery$.mockClear()
        panel.syncLegendFromModel()

        expect(readInputImagery$.mock.calls[0][2]).toEqual({defaults: false})
    })

    // The legend belongs to the classification, and is published before its imagery is read. A failure to
    // read that imagery says nothing about which classification is now selected.
    it('keeps its legend when its imagery cannot be read', () => {
        readInputImagery$.mockReturnValue(throwError(() => new Error('imagery unavailable')))
        const {panel, written} = sources()

        panel.onClassificationSelected(CLASSIFICATION)

        expect(written['ui.classificationLegend']).toEqual(LEGEND)
        expect(notifyError).toHaveBeenCalled()
    })

    it('offers the bands it did read even when no configuration could be derived', () => {
        readInputImagery$.mockReturnValue(of({bands: ['red'], defaults: null, restriction: 'NOT_DERIVABLE'}))
        const {panel, written} = sources()

        panel.onClassificationSelected(CLASSIFICATION)

        expect(written['ui.classificationBands']).toEqual(['red'])
    })
})

const LEGEND = {entries: [{value: 1, label: 'Forest'}]}

const DERIVED = {
    sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 40},
    options: {corrections: ['SR']},
    start: '2018-01-01',
    end: '2019-01-01'
}

let loadRecipe$

const classification = () => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        legend: LEGEND,
        inputImagery: {images: [{type: 'RECIPE_REF', id: MOSAIC}]},
        trainingData: {dataSets: [{type: 'RECIPE', recipe: TRAINING}]}
    }
})

beforeEach(() => {
    notifyError.mockReset()
    readInputImagery$.mockReset()
        .mockImplementation((_reference, _readers, {defaults}) => of({
            bands: ['red'],
            defaults: defaults ? DERIVED : null,
            restriction: null
        }))
    loadRecipe$ = vi.fn(id => id === CLASSIFICATION
        ? of(classification())
        : throwError(() => new Error(`No such recipe: ${id}`)))
})

const sources = () => {
    // Staged and published on dispatch, the way the real builder is: an assignment nothing dispatched has
    // not happened.
    const written = {}
    const recipeActionBuilder = () => ({
        staged: {},
        set(path, value) {
            this.staged[path] = value
            return this
        },
        dispatch() {
            Object.assign(written, this.staged)
        }
    })
    const panel = new Sources({
        model: {classification: CLASSIFICATION, dataSets: {}},
        inputs: {
            dataSets: {set: () => {}},
            cloudPercentageThreshold: {set: () => {}},
            changeFromClasses: {set: () => {}},
            changeToClasses: {set: () => {}}
        },
        loadedRecipes: {},
        loadRecipe$: (...args) => loadRecipe$(...args),
        recipeActionBuilder,
        stream: (_name, stream$, onNext, onError) => stream$.subscribe({next: onNext, error: onError})
    })
    panel.setState = state => {
        panel.state = {...panel.state, ...state}
    }
    return {panel, written}
}
