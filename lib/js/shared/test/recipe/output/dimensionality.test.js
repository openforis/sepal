import {NO_IMAGE_OUTPUT} from '#sepal/recipe/output/provider'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType, recipeTypes} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Every band of a READY description has established dimensionality - declared, inherited or observed - over every
// registered type: its canonical output and each named product, in each configuration whose schema differs. Assets
// and running images are observed as Earth Engine reports them. A Sampling Design produces no image and is refused.

const POLYGON = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]}
const OPTICAL = {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}
const PERIOD = {
    monitoringEnd: '2024-06-15', monitoringDuration: 2, monitoringDurationUnit: 'months',
    calibrationDuration: 3, calibrationDurationUnit: 'months'
}

const recipe = (type, model = {}, id = `${type.toLowerCase()}-1`) => ({id, type, model})
const scalar = name => ({name, dataType: {arrayDimensions: 0}})
const array = (name, arrayDimensions = 1) => ({name, dataType: {arrayDimensions}})

const ASSET = {type: 'ASSET', id: 'users/x/image'}
const ASSET_BANDS = [scalar('elevation'), array('coefs', 2)]
const CCDC = recipe('CCDC', {aoi: POLYGON, sources: OPTICAL})
const CCDC_CATALOGUE = [{name: 'tStart'}, {name: 'tEnd'}, {name: 'ndvi_coefs'}, {name: 'ndvi_rmse'}]

const changeAlerts = sources => recipe('CHANGE_ALERTS', {
    reference: ASSET, date: PERIOD, sources, options: {corrections: ['SR']}, changeAlertsOptions: {}
})

// [case, root, product, records, observations by reference key]
const CASES = [
    ['an optical mosaic composed by median', recipe('MOSAIC', {sources: OPTICAL, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}})],
    ['an optical mosaic composed by medoid', recipe('MOSAIC', {sources: OPTICAL, compositeOptions: {corrections: ['SR'], compose: 'MEDOID'}})],
    ['a radar mosaic at a point in time', recipe('RADAR_MOSAIC', {dates: {targetDate: '2024-06-01'}, options: {}})],
    ['a radar time scan', recipe('RADAR_MOSAIC', {dates: {fromDate: '2024-01-01', toDate: '2025-01-01'}, options: {}})],
    ['a Planet basemap mosaic', recipe('PLANET_MOSAIC', {sources: {source: 'BASEMAPS', assets: ['a']}, options: {}})],
    ['a histogram-matched Planet Daily mosaic', recipe('PLANET_MOSAIC', {sources: {source: 'DAILY', assets: ['a']}, options: {histogramMatching: 'ENABLED'}})],
    ['a probability classification', recipe('CLASSIFICATION', {classifier: {type: 'RANDOM_FOREST'}, legend: {entries: [{value: 1}, {value: 2}]}})],
    ['a class-only classification', recipe('CLASSIFICATION', {classifier: {type: 'MINIMUM_DISTANCE'}})],
    ['an unsupervised classification', recipe('UNSUPERVISED_CLASSIFICATION')],
    ['a regression', recipe('REGRESSION')],
    ['a class change', recipe('CLASS_CHANGE')],
    ['an index change', recipe('INDEX_CHANGE')],
    ['an index change with errors and a change legend', recipe('INDEX_CHANGE', {
        fromImage: {errorBand: 'e'}, toImage: {errorBand: 'e'}, legend: {entries: [{value: 1}]}
    })],
    ['a remapping with a legend', recipe('REMAPPING', {legend: {entries: [{value: 1}]}})],
    ['a phenology', recipe('PHENOLOGY')],
    ['a PyEO alerts', recipe('PYEO_ALERTS')],
    ['a time series', recipe('TIME_SERIES')],
    ['a LandTrendr change map', recipe('LANDTRENDR', {aoi: POLYGON, sources: OPTICAL, options: {corrections: ['SR']}})],
    ['a LandTrendr annual mosaic', recipe('LANDTRENDR', {aoi: POLYGON, sources: OPTICAL, options: {corrections: ['SR']}}),
        {name: 'ANNUAL_MOSAIC', parameters: {year: 2020}}],
    ['a BAYTS Historical of one pass', recipe('BAYTS_HISTORICAL', {options: {orbits: ['ASCENDING']}})],
    ['a BAYTS Historical of both passes', recipe('BAYTS_HISTORICAL', {options: {orbits: ['DESCENDING', 'ASCENDING']}})],
    ['BAYTS alerts', recipe('BAYTS_ALERTS', {reference: ASSET})],
    ['a BAYTS radar observation', recipe('BAYTS_ALERTS', {reference: ASSET, date: PERIOD, options: {}}),
        {name: 'RADAR_OBSERVATION', parameters: {position: 'first'}}],
    ['Change Alerts changes', changeAlerts({dataSetType: 'OPTICAL', ...OPTICAL})],
    ['a Change Alerts optical mosaic', changeAlerts({dataSetType: 'OPTICAL', ...OPTICAL}),
        {name: 'COLLECTION_MOSAIC', parameters: {period: 'monitoring', mosaicType: 'latest'}}],
    ['a Change Alerts latest radar mosaic', changeAlerts({dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}),
        {name: 'COLLECTION_MOSAIC', parameters: {period: 'calibration', mosaicType: 'latest'}}],
    ['a Change Alerts median radar mosaic', changeAlerts({dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}),
        {name: 'COLLECTION_MOSAIC', parameters: {period: 'monitoring', mosaicType: 'median'}}],
    ['a Change Alerts Planet mosaic', changeAlerts({dataSetType: 'PLANET', dataSets: {PLANET: ['DAILY']}, assets: ['a']}),
        {name: 'COLLECTION_MOSAIC', parameters: {period: 'monitoring', mosaicType: 'median'}}],
    ['CCDC segments, from the names it can be asked for', CCDC, undefined, [], {'RECIPE_REF:ccdc-1': {bands: CCDC_CATALOGUE}}],
    ['a CCDC count', CCDC, {name: 'COUNT'}],
    ['a CCDC segment slice', recipe('CCDC_SLICE', {source: {type: 'RECIPE_REF', id: CCDC.id}, date: {dateType: 'DATE'}}),
        undefined, [CCDC], {'RECIPE_REF:ccdc-1': {bands: CCDC_CATALOGUE}}],
    ['an interpolating CCDC slice', recipe('CCDC_SLICE', {
        source: {type: 'RECIPE_REF', id: CCDC.id}, date: {dateType: 'DATE'}, options: {gapStrategy: 'INTERPOLATE', harmonics: 1}
    }), undefined, [CCDC], {'RECIPE_REF:ccdc-1': {bands: CCDC_CATALOGUE}}],
    ['an asset mosaic, observed', recipe('ASSET_MOSAIC', {assetDetails: {assetId: ASSET.id, type: 'Image'}}),
        undefined, [], {'ASSET:users/x/image': {bands: ASSET_BANDS, evidence: []}, 'RECIPE_REF:asset_mosaic-1': {bands: ASSET_BANDS}}],
    ['a Band Math, observed', recipe('BAND_MATH', {outputBands: {outputImages: [
        {imageId: 'i-1', outputBands: [{id: 'b', name: 'elevation', defaultOutputName: 'elevation'}]}
    ]}}), undefined, [], {'RECIPE_REF:band_math-1': {bands: [array('elevation')]}}],
    ['a Masking over an asset, inheriting', recipe('MASKING', {imageToMask: ASSET}),
        undefined, [], {'ASSET:users/x/image': {bands: ASSET_BANDS, evidence: []}}],
    ['a Stack over an asset, inheriting', recipe('STACK', {
        inputImagery: {images: [{imageId: 'i-1', ...ASSET}]},
        bandNames: {bandNames: [{imageId: 'i-1', bands: [{originalName: 'coefs', outputName: 'c'}, {originalName: 'elevation', outputName: 'e'}]}]}
    }), undefined, [], {'ASSET:users/x/image': {bands: ASSET_BANDS, evidence: []}}]
]

const NON_IMAGE = [recipe('SAMPLING_DESIGN', {aoi: POLYGON})]

// Each row padded to every argument, so a short one is never handed Jest's completion callback instead.
const ROWS = CASES.map(([name, root, product, records = [], observations = {}]) => [name, root, product, records, observations])

describe('a READY description', () => {
    it.each(ROWS)('of %s states each band\'s dimensionality', (_case, root, product, records, observations) => {
        const {status, description, diagnostics} = read(root, {product, records, observations})

        expect({status, diagnostics}).toEqual({status: 'READY', diagnostics: []})
        expect(description.output.bands.length).toBeGreaterThan(0)
        description.output.bands.forEach(({name, dataType}) =>
            expect({name, established: Number.isInteger(dataType?.arrayDimensions) && dataType.arrayDimensions >= 0})
                .toEqual({name, established: true}))
    })

    it('keeps what a wrapper inherits, array and scalar alike', () => {
        const {description} = read(recipe('MASKING', {imageToMask: ASSET}), {observations: {'ASSET:users/x/image': {bands: ASSET_BANDS, evidence: []}}})

        expect(description.output.bands.map(({name, dataType}) => [name, dataType.arrayDimensions])).toEqual([['elevation', 0], ['coefs', 2]])
    })
})

describe('a recipe with no image output', () => {
    it.each(NON_IMAGE)('of type $type is refused, never described', root => {
        expect(read(root)).toMatchObject({
            status: 'INVALID',
            description: null,
            diagnostics: [{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: [root.id]}]
        })
    })
})

describe('the registered recipe types', () => {
    it('each have their canonical output and every named product described above, or are refused', () => {
        const [nonImage, image] = partition(recipeTypes(), ({imageOutput}) => imageOutput === NO_IMAGE_OUTPUT)
        const outputs = image.flatMap(({type, mapProducts = {}}) => [type, ...Object.keys(mapProducts).map(name => `${type}/${name}`)])

        expect(new Set(CASES.map(([, {type}, product]) => product ? `${type}/${product.name}` : type))).toEqual(new Set(outputs))
        expect(new Set(NON_IMAGE.map(({type}) => type))).toEqual(new Set(nonImage.map(({type}) => type)))
    })
})

const partition = (items, predicate) => [items.filter(predicate), items.filter(item => !predicate(item))]

const read = (root, {product, records = [], observations = {}} = {}) => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(record => [record.id, record]))}),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: ({type, id}) => observations[`${type}:${id}`],
    ...(product && {product, productFor: (recipe, name) => recipeType(recipe.type)?.mapProducts?.[name]})
})
