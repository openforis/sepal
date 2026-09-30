import {mayProvideHistoricalStats} from '#sepal/recipe/capability/baytsHistoricalStats'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The bands a BAYTS Historical provides, from its persisted model alone, through the real BAYTS Historical, Masking
// and Stack declarations and the common read. Band names, policies, codes and paths are literals.

const pass = suffix => [
    band(`VV_mean_${suffix}`, 'mean'),
    band(`VV_std_${suffix}`, 'mean'),
    band(`VH_mean_${suffix}`, 'mean'),
    band(`VH_std_${suffix}`, 'mean'),
    band(`orbit_${suffix}`, 'mode'),
    band(`VV_speckle_${suffix}`, 'mean'),
    band(`VH_speckle_${suffix}`, 'mean')
]

describe('a BAYTS Historical', () => {
    it.each([
        ['ascending', ['ASCENDING'], pass('asc')],
        ['descending', ['DESCENDING'], pass('desc')],
        ['both passes', ['ASCENDING', 'DESCENDING'], [...pass('asc'), ...pass('desc')]],
        ['both passes, stored descending first', ['DESCENDING', 'ASCENDING'], [...pass('desc'), ...pass('asc')]]
    ])('over %s provides each pass\'s statistics in the order its model stores the passes', (_case, orbits, bands) => {
        const {status, description} = read(historical({orbits}))

        expect(status).toBe('READY')
        expect(description.output.bands).toEqual(bands)
    })

    it('is described the same whatever speckle filtering it applies', () => {
        const filtered = historical({orbits: ['ASCENDING'], spatialSpeckleFilter: 'NONE', multitemporalSpeckleFilter: 'QUEGAN'})

        expect(read(filtered).description.output.bands).toEqual(pass('asc'))
    })

    it('is described while the recipe its AOI comes from is not even loaded', () => {
        const result = read(historical({aoi: {type: 'RECIPE', id: 'aoi-1'}}))

        expect(result.status).toBe('READY')
        expect(result.needs).toEqual({records: [], observations: []})
    })

    it('still states the historical statistics a BAYTS Alerts reads from it, computed rather than stored', () => {
        expect(mayProvideHistoricalStats('BAYTS_HISTORICAL')).toBe(true)
        expect(recipeType('BAYTS_HISTORICAL').historicalStatsSource.statsAsset(historical().model)).toBeNull()
    })
})

describe('a BAYTS Historical whose orbits cannot name its bands', () => {
    it.each([
        ['states no options', {model: {dates: {}}}, [{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'options', 'orbits']}]],
        ['states no orbits', {model: {dates: {}, options: {spatialSpeckleFilter: 'LEE'}}}, [{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'options', 'orbits']}]],
        ['states an empty list', {orbits: []}, [{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'options', 'orbits']}]],
        ['states a single orbit rather than a list', {orbits: 'ASCENDING'}, [{code: 'MALFORMED_IMAGE_OUTPUT', path: ['model', 'options', 'orbits']}]],
        ['names an unknown pass', {orbits: ['ASCENDING', 'SIDEWAYS']}, [{code: 'MALFORMED_IMAGE_OUTPUT', path: ['model', 'options', 'orbits', 1]}]],
        ['wraps a pass in a list', {orbits: [['ASCENDING']]}, [{code: 'MALFORMED_IMAGE_OUTPUT', path: ['model', 'options', 'orbits', 0]}]],
        ['names a pass twice', {orbits: ['DESCENDING', 'ASCENDING', 'DESCENDING']}, [{code: 'DUPLICATE_BAND_NAME', path: ['model', 'options', 'orbits', 2]}]]
    ])('is refused when it %s', (_case, configuration, diagnostics) => {
        const recipe = configuration.model ? {...historical(), model: configuration.model} : historical(configuration)

        const result = read(recipe)

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics).toEqual(diagnostics.map(diagnostic => ({...diagnostic, recipePath: ['historical-1']})))
    })
})

describe('a recipe over a BAYTS Historical', () => {
    const both = historical({orbits: ['ASCENDING', 'DESCENDING']})

    it('keeps its bands and policies through a Masking', () => {
        const masking = {id: 'masking-1', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: both.id}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}}

        expect(read(masking, [both]).description.output.bands).toEqual(read(both).description.output.bands)
    })

    it('keeps its policies under the names a Stack gives', () => {
        const stack = {
            id: 'stack-1',
            type: 'STACK',
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: both.id}]},
                bandNames: {bandNames: [{imageId: 'i-1', bands: [
                    {id: 'b1', originalName: 'orbit_desc', outputName: 'orbit'},
                    {id: 'b2', originalName: 'VV_mean_asc', outputName: 'vv'}
                ]}]}
            }
        }

        expect(read(stack, [both]).description.output.bands).toEqual([band('orbit', 'mode'), band('vv', 'mean')])
    })
})

function band(name, pyramidingPolicy) {
    return {name, dataType: {arrayDimensions: 0}, pyramidingPolicy}
}

function historical({orbits = ['ASCENDING'], aoi = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}, ...options} = {}) {
    return {
        id: 'historical-1',
        type: 'BAYTS_HISTORICAL',
        model: {
            aoi,
            dates: {fromDate: '2023-01-01', toDate: '2024-01-01'},
            options: {orbits, spatialSpeckleFilter: 'LEE', multitemporalSpeckleFilter: 'NONE', ...options}
        }
    }
}

const read = (recipe, records = []) => readImageOutput({
    graph: buildRecipeDependencyGraph({
        rootRecipe: recipe,
        recipesById: new Map([recipe, ...records].map(record => [record.id, record]))
    }),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: () => undefined
})
