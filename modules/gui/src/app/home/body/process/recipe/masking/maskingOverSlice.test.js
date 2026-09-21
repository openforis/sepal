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
const {availableBandsOf, materializedTemplates} = await import('../ccdcSlice/sliceEvidence')

registry.CCDC = {describeSegments$, getPreSetVisualizations: () => []}
registry.CCDC_SLICE = {
    resolveEvidence$,
    getAvailableBands: (recipe, evidence) => availableBandsOf(recipe, evidence?.segments),
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

const sync = ({recipe, loadedRecipes}) => {
    const dispatched = []
    const recipeActionBuilder = () => ({
        set(path, value) {
            this.written = {path, value}
            return this
        },
        dispatch() {
            dispatched.push(this.written)
        }
    })
    const component = new SourceEvidenceSync({
        observation: maskingObservation,
        recipe,
        loadedRecipes,
        catalogue: [],
        openRecipeIds: [],
        assetVersions: [],
        earthEngineGeneration: {},
        recipeActionBuilder,
        loadRecipe$: id => of(loadedRecipes[id]),
        reloadRecipe$: id => of(loadedRecipes[id]),
        stream: (_name, stream$, onNext, onError) => stream$.subscribe({next: onNext, error: onError})
    })
    return {component, evidence: () => dispatched.map(({value}) => value)}
}

beforeEach(() => {
    bands$.mockReset()
    assetMetadata$.mockReset()
    // CCDC answers with the names it says it can be asked for; an asset is read as the image it stores.
    bands$.mockImplementation(({asset}) => of(asset
        ? [
            ...['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'].map(name => ({name, arrayDimensions: 1})),
            {name: 'ndvi_coefs', arrayDimensions: 2},
            {name: 'ndvi_rmse', arrayDimensions: 1},
            {name: 'ndvi_magnitude', arrayDimensions: 1}
        ]
        : [
            'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
            'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude'
        ]))
})

describe('masking a saved slice that has never been opened', () => {
    const open = () => sync({
        recipe: maskingOver('slice-1'),
        loadedRecipes: {'slice-1': savedSlice(), 'ccdc-1': ccdc()}
    })

    it('takes the scalar bands the slice declares over the segments of its CCDC', () => {
        const {component, evidence} = open()

        component.componentDidMount()

        expect(bands$).not.toHaveBeenCalledWith(expect.objectContaining({
            recipe: expect.objectContaining({id: 'slice-1'})
        }))
        const bands = evidence()[0].bands
        expect(bands.map(({name}) => name)).toEqual(expect.arrayContaining(['ndvi', 'ndvi_phase_1', 'tStart']))
        expect(bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
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
    it('reads again when the source observation advances even with identical bands and templates', () => {
        const source = {...savedSlice(), ui: {sourceEvidence: {
            sourceKey: 'RECIPE_REF:ccdc-1', status: 'OBSERVED', observation: 1,
            segments: {visualizations: [NDVI_TEMPLATE, HARMONIC_TEMPLATE]}
        }}}
        const {component, evidence} = sync({
            recipe: maskingOver(source.id),
            loadedRecipes: {[source.id]: source, 'ccdc-1': ccdc()}
        })
        component.componentDidMount()
        expect(bands$).toHaveBeenCalledTimes(1)

        component.props = {...component.props, loadedRecipes: {
            ...component.props.loadedRecipes,
            [source.id]: {...source, ui: {sourceEvidence: {...source.ui.sourceEvidence, observation: 2}}}
        }}
        component.componentDidUpdate()

        expect(bands$).toHaveBeenCalledTimes(2)
        expect(evidence()).toHaveLength(2)
        expect(evidence()[1].bands).toEqual(evidence()[0].bands)
        expect(evidence()[1].visualizations).toEqual(evidence()[0].visualizations)
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
