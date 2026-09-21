import _ from 'lodash'
import {of, throwError} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// The bands Masking offers, as its consumers read them once the shared evidence lifecycle has acquired them.
// Declarations, resolution, the output observer and the lifecycle are real; only the Earth Engine bands API and
// the GUI recipe-type registry are substituted.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

const bands$ = vi.fn()
const assetMetadata$ = vi.fn()

vi.mock('~/apiRegistry', () => ({
    default: {gee: {bands$: (...args) => bands$(...args), assetMetadata$: (...args) => assetMetadata$(...args)}}
}))

vi.mock('../../recipeTypeRegistry', () => ({
    getRecipeType: () => ({getPreSetVisualizations: () => []})
}))

const {ccdcMeasures, ccdcOutputBands} = await import('#sepal/recipe/type/ccdc')
const {SourceEvidenceSync} = await import('../sourceEvidenceSync')
const {maskingObservation} = await import('./maskingSourceEvidence')
const {getAvailableBands} = await import('./bands')

const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}

describe('Masking over an optical mosaic', () => {
    it('offers a generated index alongside ordinary and tasseled-cap bands, without observing the mosaic', () => {
        const {component, current} = sync({recipe: masking('masked-1', 'mosaic-1'), records: [mosaic()]})

        component.componentDidMount()

        expect(bandChoices(current())).toEqual(expect.arrayContaining(['red', 'nir', 'greenness', 'nbr']))
        expect(bands$).not.toHaveBeenCalled()
    })

    it('carries each band\'s dimensionality and encoding', () => {
        const {component, current} = sync({recipe: masking('masked-1', 'mosaic-1'), records: [mosaic()]})

        component.componentDidMount()

        expect(getAvailableBands(current()).nbr).toEqual({dataType: {arrayDimensions: 0}, encoding: REFLECTANCE})
    })

    it('offers the same choices and band facts through a nested Masking', () => {
        const direct = sync({recipe: masking('masked-1', 'mosaic-1'), records: [mosaic()]})
        const nested = sync({
            recipe: masking('masked-2', 'masked-1'),
            records: [masking('masked-1', 'mosaic-1'), mosaic()]
        })

        direct.component.componentDidMount()
        nested.component.componentDidMount()

        expect(getAvailableBands(nested.current())).toEqual(getAvailableBands(direct.current()))
        expect(bandChoices(nested.current())).toContain('nbr')
    })

    it('updates the choices when the mosaic\'s contributing data sets change', () => {
        const landsat = mosaic()
        const {component, rerender, current} = sync({recipe: masking('masked-1', 'mosaic-1'), records: [landsat]})
        component.componentDidMount()
        expect(bandChoices(current())).toEqual(expect.arrayContaining(['thermal', 'ebbi']))

        const withSentinel2 = _.set(_.cloneDeep(landsat), 'model.sources.dataSets.SENTINEL_2', ['SENTINEL_2'])
        rerender({loadedRecipes: {[withSentinel2.id]: withSentinel2}})

        expect(bandChoices(current())).not.toContain('thermal')
        expect(bandChoices(current())).not.toContain('ebbi')
        expect(bandChoices(current())).toContain('nbr')
    })
})

// A collection asset is read as its first image, while the Asset recipe over it filters before compositing. What
// Masking offers is the recipe's own configured output, not what reading the asset shows.
describe('Masking over an Asset recipe that filters its collection', () => {
    const assetRecipe = () => ({
        id: 'asset-1',
        type: 'ASSET_MOSAIC',
        model: {
            assetDetails: {assetId: 'users/x/collection', type: 'ImageCollection'},
            dates: {type: 'DATE_RANGE', fromDate: '2021-01-01', toDate: '2022-01-01'},
            composite: {type: 'MOSAIC'}
        }
    })

    const observing = () => bands$.mockImplementation(({asset}) => of(asset
        ? [{name: 'red', arrayDimensions: 0, encoding: REFLECTANCE}]
        : [{name: 'red', arrayDimensions: 0}, {name: 'nir', arrayDimensions: 0}]
    ))

    it('offers the band the filter leaves, which the asset\'s own reading omits', () => {
        observing()
        const {component, current} = sync({recipe: masking('masked-1', 'asset-1'), records: [assetRecipe()]})

        component.componentDidMount()

        expect(bandChoices(current())).toEqual(['red', 'nir'])
        expect(getAvailableBands(current())).toEqual({
            red: {dataType: {arrayDimensions: 0}, encoding: REFLECTANCE},
            nir: {dataType: {arrayDimensions: 0}}
        })
    })

    it('reads the recipe\'s own image and its asset, each once', () => {
        observing()
        const {component} = sync({recipe: masking('masked-1', 'asset-1'), records: [assetRecipe()]})

        component.componentDidMount()

        expect(bands$.mock.calls.map(([args]) => args.asset || args.recipe.id).sort())
            .toEqual(['asset-1', 'users/x/collection'])
    })

    it('offers nothing when the recipe\'s own image cannot be observed', () => {
        bands$.mockImplementation(({asset}) => asset
            ? of([{name: 'red', arrayDimensions: 0, encoding: REFLECTANCE}])
            : throwError(() => new Error('Earth Engine unavailable')))
        const {component, current} = sync({recipe: masking('masked-1', 'asset-1'), records: [assetRecipe()]})

        component.componentDidMount()

        expect(current().ui.sourceEvidence.status).toBe('UNAVAILABLE')
        expect(bandChoices(current())).toEqual([])
    })
})

describe('Masking over a directly selected asset', () => {
    it('carries the encoding the asset states', () => {
        bands$.mockReturnValue(of([
            {name: 'red', arrayDimensions: 0, encoding: REFLECTANCE},
            {name: 'qa', arrayDimensions: 0}
        ]))
        assetMetadata$.mockReturnValue(of({bandNames: ['red', 'qa'], properties: {}}))
        const recipe = {id: 'masked-1', type: 'MASKING', model: {imageToMask: {type: 'ASSET', id: 'users/x/image'}}}
        const {component, current} = sync({recipe, records: []})

        component.componentDidMount()

        expect(bands$).toHaveBeenCalledWith({asset: 'users/x/image', includeDataTypes: true})
        expect(getAvailableBands(current())).toEqual({
            red: {dataType: {arrayDimensions: 0}, encoding: REFLECTANCE},
            qa: {dataType: {arrayDimensions: 0}}
        })
    })
})

// Observing the running image is only for a source whose type declares no output.
describe('a declared source that cannot be described', () => {
    it.each([
        ['its observation fails', () => throwError(() => new Error('Earth Engine unavailable'))],
        ['its declaration yields an invalid output', () => of(['red_coefs', 'red_coefs'])]
    ])('offers nothing when %s, rather than observing it another way', (_case, observation) => {
        bands$.mockImplementation(observation)
        const {component, current} = sync({
            recipe: masking('masked-1', 'ccdc-1'),
            records: [{id: 'ccdc-1', type: 'CCDC', model: {}}]
        })

        component.componentDidMount()

        expect(bands$).toHaveBeenCalledTimes(1)
        expect(current().ui.sourceEvidence.status).toBe('UNAVAILABLE')
        expect(bandChoices(current())).toEqual([])
    })
})

// A CCDC fits only the measures it is asked for, so the image it builds unrequested holds the breakpoint
// measures alone. What Masking may offer is the catalogue CCDC declares instead.
describe('Masking over CCDC', () => {
    // Earth Engine's /bands, answering each of the two questions the gee module puts to a recipe: the bands of
    // the image it builds when asked for nothing, or the catalogue it declares. `nativeBands` stands for the
    // Planet imagery's own schema, which the gee module reads off the configured asset.
    const earthEngine = ({nativeBands} = {}) => bands$.mockImplementation(({recipe, includeDataTypes}) =>
        includeDataTypes
            ? of(ccdcOutputBands(recipe.model.sources.breakpointBands)
                .map(name => ({name, arrayDimensions: name.endsWith('_coefs') ? 2 : 1})))
            : of(ccdcOutputBands(ccdcMeasures({model: recipe.model, nativeBands}))))

    it('offers a measure it can fit but does not break on, once evidence has replaced the saved list', () => {
        earthEngine()
        const {component, current} = sync({recipe: overCcdc(), records: [ccdc()]})

        expect(bandChoices(current())).toContain('red_coefs')

        component.componentDidMount()

        expect(current().ui.sourceEvidence.status).toBe('OBSERVED')
        expect(bandChoices(current())).toContain('red_coefs')
        expect(bandChoices(current())).toContain('ndvi_coefs')
        expect(bandChoices(current())).toContain('tStart')
    })

    it('asks CCDC what it can be asked for, never for the image it builds unrequested', () => {
        earthEngine()
        const {component} = sync({recipe: overCcdc(), records: [ccdc()]})

        component.componentDidMount()

        expect(bands$).toHaveBeenCalledTimes(1)
        expect(bands$.mock.calls[0][0].includeDataTypes).toBeUndefined()
    })

    it('carries the dimensionality and policy CCDC declares of each band', () => {
        earthEngine()
        const {component, current} = sync({recipe: overCcdc(), records: [ccdc()]})

        component.componentDidMount()

        expect(getAvailableBands(current()).red_coefs).toEqual({dataType: {arrayDimensions: 2}})
        expect(getAvailableBands(current()).tStart).toEqual({dataType: {arrayDimensions: 1}})
    })

    // A breakpoint band the data sets no longer carry is saved intent, not availability: Sentinel-2 has no
    // thermal band, so segmentation has no input to fit and the measure cannot be offered.
    it('offers no measure for a breakpoint band its data sets no longer carry', () => {
        earthEngine()
        const stale = _.set(_.cloneDeep(ccdc()), 'model.sources', {
            dataSets: {SENTINEL_2: ['SENTINEL_2']},
            breakpointBands: ['thermal']
        })
        const {component, current} = sync({recipe: overCcdc(), records: [stale]})

        component.componentDidMount()

        expect(bandChoices(current())).not.toContain('thermal_coefs')
        expect(bandChoices(current())).toContain('red_coefs')
    })

    // Which bands Planet Daily carries depends on the imagery in the configured asset: eight-band PSB.SD has
    // four more than four-band imagery, and merging the branches cannot give either the other's bands.
    const dailyPlanet = () => _.set(_.cloneDeep(ccdc()), 'model.sources', {
        dataSets: {PLANET: ['DAILY']},
        assets: ['users/x/daily'],
        breakpointBands: ['ndvi']
    })

    it('offers the extra measures of eight-band Planet Daily imagery', () => {
        earthEngine({nativeBands: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']})
        const {component, current} = sync({recipe: overCcdc(), records: [dailyPlanet()]})

        component.componentDidMount()

        expect(bandChoices(current())).toEqual(expect.arrayContaining([
            'redEdge_coefs', 'yellow_coefs', 'ndvi_coefs'
        ]))
    })

    it('offers no eight-band measure for four-band Planet Daily imagery', () => {
        earthEngine({nativeBands: ['B1', 'B2', 'B3', 'B4']})
        const {component, current} = sync({recipe: overCcdc(), records: [dailyPlanet()]})

        component.componentDidMount()

        expect(bandChoices(current())).toEqual(expect.arrayContaining(['red_coefs', 'ndvi_coefs']))
        expect(bandChoices(current())).not.toContain('redEdge_coefs')
    })

    it('offers only the matched measures when Planet Daily imagery is histogram-matched', () => {
        earthEngine({nativeBands: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']})
        const matched = _.set(dailyPlanet(), 'model.options.histogramMatching', 'ENABLED')
        const {component, current} = sync({recipe: overCcdc(), records: [matched]})

        component.componentDidMount()

        expect(bandChoices(current())).toEqual(expect.arrayContaining(['red_coefs', 'ndvi_coefs']))
        expect(bandChoices(current())).not.toContain('redEdge_coefs')
    })

    it('refreshes the choices when the CCDC source configuration changes', () => {
        earthEngine()
        const landsat = ccdc()
        const {component, rerender, current} = sync({recipe: overCcdc(), records: [landsat]})
        component.componentDidMount()
        expect(bandChoices(current())).toContain('thermal_coefs')

        const sentinel2 = _.set(_.cloneDeep(landsat), 'model.sources.dataSets', {SENTINEL_2: ['SENTINEL_2']})
        rerender({loadedRecipes: {[sentinel2.id]: sentinel2}})

        expect(bandChoices(current())).not.toContain('thermal_coefs')
        expect(bandChoices(current())).toContain('red_coefs')
    })
})

// The saved list copied into the model when CCDC was selected, which is what a reopened recipe shows before
// anything is observed.
const overCcdc = () => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: 'ccdc-1', bands: ['tStart', 'red_coefs', 'ndvi_coefs']}}
})

const ccdc = () => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        dates: {startDate: '2000-01-01', endDate: '2020-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1}
    }
})

const masking = (id, sourceId) => ({id, type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: sourceId}}})

const mosaic = () => ({
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    }
})

const bandChoices = recipe => Object.keys(getAvailableBands(recipe))

// The lifecycle's dispatch applied to a recipe the test holds, so consumers read what was published.
const sync = ({recipe, records}) => {
    const byId = Object.fromEntries(records.map(record => [record.id, record]))
    let held = recipe
    const recipeActionBuilder = () => ({
        set(path, value) {
            this.written = {path, value}
            return this
        },
        dispatch() {
            held = _.set(_.cloneDeep(held), this.written.path, this.written.value)
        }
    })
    const component = new SourceEvidenceSync({
        observation: maskingObservation,
        recipe,
        loadedRecipes: byId,
        catalogue: [],
        openRecipeIds: [],
        assetVersions: [],
        earthEngineGeneration: {},
        recipeActionBuilder,
        loadRecipe$: id => byId[id] ? of(byId[id]) : throwError(() => new Error(`Not found: ${id}`)),
        reloadRecipe$: id => of(byId[id]),
        stream: (_name, stream$, onNext, onError) => stream$.subscribe({next: onNext, error: onError})
    })
    const rerender = props => {
        component.props = {...component.props, ...props}
        component.componentDidUpdate()
    }
    return {component, rerender, current: () => held}
}

beforeEach(() => {
    bands$.mockReset()
    assetMetadata$.mockReset()
})
