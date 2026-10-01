import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// A Masking recipe over a saved CCDC Slice. The Slice has never been opened, so it holds no runtime evidence
// of its own and - once the source panel stopped writing them - no copied description either. What it offers
// has to be resolved as part of resolving Masking's dependencies, or Masking gets bands with no presets.
//
// The Slice's own resolution is the real one, reached through the registry the way production reaches it.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

const bands$ = vi.fn()
const assetMetadata$ = vi.fn()
vi.mock('~/apiRegistry', () => ({
    default: {
        gee: {
            bands$: (...args) => bands$(...args),
            assetMetadata$: (...args) => assetMetadata$(...args)
        }
    }
}))

vi.mock('~/sources', () => ({getAvailableBands: ({dataSets}) => dataSets.map(dataSet => dataSet.toLowerCase())}))

vi.mock('../ccdc/ccdcRecipe', () => ({
    getAllVisualizations: recipe => recipe.model.templates || []
}))

// Filled in below rather than inside the factory: the modules that register these entries read the registry
// themselves, and importing them from within its own mock would never resolve.
const registry = vi.hoisted(() => ({}))
vi.mock('../../recipeTypeRegistry', () => ({getRecipeType: type => registry[type]}))

const {SourceEvidenceSync} = await import('../sourceEvidenceSync')
const {maskingObservation} = await import('./maskingSourceEvidence')
const {describeSegments$} = await import('../ccdc/segmentDescription')
const {resolveEvidence$} = await import('../ccdcSlice/sliceObservation')
const {materializedTemplates} = await import('../ccdcSlice/sliceEvidence')

registry.CCDC = {describeSegments$, getPreSetVisualizations: () => []}
registry.CCDC_SLICE = {
    resolveEvidence$,
    getPreSetVisualizations: (recipe, evidence) => materializedTemplates(recipe, evidence?.segments)
}

const NDVI_TEMPLATE = {id: 't-ndvi', bands: ['ndvi'], type: 'continuous'}
const HARMONIC_TEMPLATE = {
    id: 't-harmonic',
    bands: ['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse'],
    type: 'hsv'
}

// Saved with a reference and nothing else - no copied bands, base bands or templates.
const savedSlice = () => ({
    id: 'slice-1',
    type: 'CCDC_SLICE',
    model: {
        source: {type: 'RECIPE_REF', id: 'ccdc-1'},
        date: {dateType: 'SINGLE', date: '2020-06-01'},
        options: {gapStrategy: 'MASK', harmonics: 3}
    }
})

const ccdc = () => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        sources: {dataSets: {LANDSAT: ['NDVI']}},
        options: {corrections: []},
        ccdcOptions: {dateFormat: 1},
        templates: [NDVI_TEMPLATE, HARMONIC_TEMPLATE]
    }
})

const maskingOver = sourceId => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: sourceId}}
})

// The evidence the lifecycle published, apart from its marks that it is reading again.
const published = writes => writes
    .filter(({path}) => path === 'ui.sourceEvidence')
    .map(({value}) => value)

const sync = ({recipe, loadedRecipes}) => {
    const dispatched = []
    const recipeActionBuilder = () => ({
        writes: [],
        set(path, value) {
            this.writes.push({path, value})
            return this
        },
        dispatch() {
            dispatched.push(...this.writes)
        }
    })
    const component = new SourceEvidenceSync({
        observation: maskingObservation,
        recipe,
        loadedRecipes,
        catalogue: [],
        openRecipeIds: [],
        assetEvidence: {},
        earthEngineGeneration: {},
        recipeActionBuilder,
        loadRecipe$: id => of(loadedRecipes[id]),
        reloadRecipe$: id => of(loadedRecipes[id]),
        stream: (_name, stream$, onNext, onError) => stream$.subscribe({next: onNext, error: onError})
    })
    return {component, evidence: () => published(dispatched)}
}

beforeEach(() => {
    bands$.mockReset()
    assetMetadata$.mockReset()
})

describe('masking a saved slice that has never been opened', () => {
    const open = () => sync({
        recipe: maskingOver('slice-1'),
        loadedRecipes: {'slice-1': savedSlice(), 'ccdc-1': ccdc()}
    })

    // The presets are the slice's, materialized against what the slice produces - which needs the CCDC
    // recipe behind it, resolved as part of this operation rather than by opening the slice.
    it('takes the presets the slice offers, resolved through its own source', () => {
        const {component, evidence} = open()

        component.componentDidMount()

        expect(evidence()[0].visualizations.map(({id}) => id)).toEqual(['t-ndvi', 't-harmonic'])
    })

    it('reads nothing from Earth Engine to describe a recipe-backed source', () => {
        const {component} = open()

        component.componentDidMount()

        expect(bands$).not.toHaveBeenCalled()
        expect(assetMetadata$).not.toHaveBeenCalled()
    })
})

describe('masking a slice whose own source is gone', () => {
    it('offers no presets rather than guessing at them', () => {
        const {component, evidence} = sync({
            recipe: maskingOver('slice-1'),
            loadedRecipes: {'slice-1': savedSlice()}
        })

        component.componentDidMount()

        expect(evidence()[0].status).toBe('UNAVAILABLE')
    })
})

describe('masking a slice with runtime source evidence', () => {
    it('reads again when the source\'s evidence changes, and not when the same evidence is published again', () => {
        const sliceEvidence = visualizations => ({
            sourceKey: 'RECIPE_REF:ccdc-1', status: 'OBSERVED', segments: {visualizations}
        })
        const source = {...savedSlice(), ui: {sourceEvidence: sliceEvidence([NDVI_TEMPLATE, HARMONIC_TEMPLATE])}}
        const {component, evidence} = sync({
            recipe: maskingOver(source.id),
            loadedRecipes: {[source.id]: source, 'ccdc-1': ccdc()}
        })
        component.componentDidMount()
        const publishes = evidence => {
            component.props = {...component.props, loadedRecipes: {
                ...component.props.loadedRecipes,
                [source.id]: {...source, ui: {sourceEvidence: evidence}}
            }}
            component.componentDidUpdate()
        }

        publishes(sliceEvidence([NDVI_TEMPLATE, HARMONIC_TEMPLATE]))
        expect(evidence()).toHaveLength(1)
        publishes(sliceEvidence([NDVI_TEMPLATE]))

        expect(evidence()).toHaveLength(2)
    })

    it('stops assigning saved template identities once their source provenance changes', () => {
        const asset = {type: 'ASSET', id: 'users/test/segments'}
        assetMetadata$.mockReturnValue(of({
            bandNames: ['ndvi_coefs'],
            properties: {visualization_0_bands: 'ndvi', visualization_0_type: 'continuous'}
        }))
        const source = {
            ...savedSlice(),
            model: {...savedSlice().model, source: asset},
            ui: {savedLayerSource: `ASSET:${asset.id}`},
            layers: {areas: {center: {imageLayer: {
                sourceId: 'this-recipe', layerConfig: {visParams: NDVI_TEMPLATE}
            }}}}
        }
        const {component, evidence} = sync({
            recipe: maskingOver(source.id),
            loadedRecipes: {[source.id]: source}
        })
        component.componentDidMount()
        expect(evidence()[0].visualizations[0].id).toBe(NDVI_TEMPLATE.id)

        component.props = {...component.props, loadedRecipes: {
            [source.id]: {...source, ui: {savedLayerSource: 'ASSET:users/test/previous'}}
        }}
        component.componentDidUpdate()

        expect(evidence()).toHaveLength(2)
        expect(evidence()[1].visualizations[0].id).not.toBe(NDVI_TEMPLATE.id)
    })
})
