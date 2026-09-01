import {jest} from '@jest/globals'
import {lastValueFrom, of} from 'rxjs'

// What an existing CCDC Segments asset contains. These are characterization tests: they pin the format already
// written into every asset users hold, so that anything reading one later can be held to the same shape.
//
// Only the Earth Engine boundary and the export job are mocked. `formatProperties` and `toVisualizationProperties`
// run for real, because the serialized property strings ARE the contract - a reader parses those exact bytes.

const captured = {}

const geometry = {bounds: () => 'region-bounds'}

jest.unstable_mockModule('#sepal/ee/timeSeries/ccdc', () => ({
    default: (recipe, options) => {
        captured.ccdc = {recipe, options}
        return {
            getImage$: () => of('segments-image'),
            getGeometry$: () => of(geometry)
        }
    }
}))
jest.unstable_mockModule('./workloadTag.js', () => ({
    setWorkloadTag: recipe => captured.workloadTag = recipe
}))
jest.unstable_mockModule('../jobs/export/toAsset.js', () => ({
    exportImageToAsset$: (taskId, args) => {
        captured.export = {taskId, args}
        return of('exported')
    }
}))

const {submit$} = await import('./ccdcAssetExport.js')

const recipe = ({corrections = ['SR']} = {}) => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        dates: {startDate: '2015-01-01', endDate: '2020-01-01'},
        ccdcOptions: {dateFormat: 1},
        options: {corrections}
    }
})

// Visualizations reach the task already normalized by the GUI, so the fixtures are what normalize() produces.
const NDVI = {
    type: 'continuous',
    bands: ['ndvi'],
    baseBands: ['ndvi'],
    min: [-10000],
    max: [10000],
    palette: ['#FF0000', '#00FF00'],
    inverted: [false]
}

// A harmonic template. Its bands are the LOGICAL coefficient bands Slice derives; none of them is a band the
// asset physically carries.
const HARMONIC = {
    type: 'hsv',
    bands: ['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse'],
    baseBands: ['ndvi'],
    min: [-3.141592653589793, 0, 0],
    max: [3.141592653589793, 3000, 2500],
    inverted: [false, false, true],
    gamma: [1, 1, 1]
}

const submit = async ({model = recipe(), bands = ['ndvi'], visualizations = [], properties, scale = 30} = {}) => {
    await lastValueFrom(submit$('task-1', {
        image: {
            recipe: model,
            bands,
            scale,
            visualizations,
            properties,
            assetId: 'users/me/my-ccdc'
        },
        description: 'my-ccdc'
    }))
    return captured.export.args
}

const visualizationProperties = properties =>
    Object.fromEntries(Object.entries(properties).filter(([key]) => key.startsWith('visualization_')))

describe('the CCDC Segments asset export', () => {
    it('writes an array-band asset with sample pyramiding', async () => {
        const {pyramidingPolicy, maxPixels, region, scale, image} = await submit()

        expect(pyramidingPolicy).toEqual({'.default': 'sample'})
        expect(maxPixels).toBe(1e13)
        expect(region).toBe('region-bounds')
        expect(scale).toBe(30)
        expect(image).toBe('segments-image')
    })

    it('passes the retrieve band selection to the segment builder', async () => {
        await submit({bands: ['ndvi', 'swir1']})

        expect(captured.ccdc.options).toEqual({selection: ['ndvi', 'swir1']})
    })
})

// Of the properties written here, CCDC Slice reads exactly three: dateFormat, startDate and endDate. Everything
// else it needs it derives from the asset's band names.
describe('the date metadata CCDC Slice reads back', () => {
    it('records the segment date range and date format', async () => {
        const {properties} = await submit()

        expect(properties.startDate).toBe('2015-01-01')
        expect(properties.endDate).toBe('2020-01-01')
        expect(properties.dateFormat).toBe(1)
    })

})

// Written into every asset, read by nothing in Slice. Its three-valued shape is recorded because a future reader
// would have to cope with all three - and one of the two real assets omits it entirely.
describe('the surface reflectance flag, which Slice does not read', () => {
    it('records surface reflectance as 1 when the correction was applied', async () => {
        const {properties} = await submit({model: recipe({corrections: ['SR']})})

        expect(properties.surfaceReflectance).toBe(1)
    })

    // Not 0 and not absent - `corrections.includes('SR') && 1` yields the boolean.
    it('records surface reflectance as false when it was not', async () => {
        const {properties} = await submit({model: recipe({corrections: []})})

        expect(properties.surfaceReflectance).toBe(false)
    })

    it('records it as undefined when the recipe carries no corrections at all', async () => {
        const model = recipe()
        delete model.model.options.corrections
        const {properties} = await submit({model})

        expect(properties.surfaceReflectance).toBeUndefined()
    })
})

describe('the formatted recipe properties', () => {
    it('passes strings and numbers through and serializes everything else', async () => {
        const {properties} = await submit({
            scale: 30,
            properties: {
                recipe_id: 'ccdc-1',
                recipe_title: 'My CCDC',
                recipe_dates: {startDate: '2015-01-01'},
                recipe_bands: ['ndvi'],
                'system:time_start': 1420070400000
            }
        })

        expect(properties.formattedProperties).toEqual({
            recipe_id: 'ccdc-1',
            recipe_title: 'My CCDC',
            recipe_dates: '{"startDate":"2015-01-01"}',
            recipe_bands: '["ndvi"]',
            'system:time_start': 1420070400000,
            scale: 30
        })
    })

    // A nested object, not flattened property keys: a reader has to JSON.parse it back.
    it('nests them under a single property rather than at the top level', async () => {
        const {properties} = await submit({properties: {recipe_id: 'ccdc-1'}})

        expect(properties.recipe_id).toBeUndefined()
        expect(properties.formattedProperties.recipe_id).toBe('ccdc-1')
    })
})

describe('the serialized visualizations', () => {
    it('writes every field of a visualization, one property per key', async () => {
        const {properties} = await submit({visualizations: [NDVI]})

        expect(visualizationProperties(properties)).toEqual({
            visualization_0_type: 'continuous',
            visualization_0_bands: 'ndvi',
            visualization_0_baseBands: 'ndvi',
            visualization_0_min: '-10000',
            visualization_0_max: '10000',
            visualization_0_palette: '#FF0000,#00FF00',
            visualization_0_inverted: 'false',
            visualization_0_name: 'ndvi'
        })
    })

    // Every array-valued field becomes a comma-joined string, a one-element array included: `min: [-10000]` is
    // written as the string '-10000', not the number. Nothing in the asset records that it was ever a number.
    it('writes numbers and booleans as strings once they are in an array', async () => {
        const {properties} = await submit({visualizations: [NDVI]})

        expect(typeof properties.visualization_0_min).toBe('string')
        expect(typeof properties.visualization_0_inverted).toBe('string')
    })

    // baseBands is not a rendering parameter. It says which logical CCDC band the template belongs to, and it is
    // serialized like any other field because the writer serializes whatever the visualization carries.
    it('carries baseBands through as an ordinary field', async () => {
        const {properties} = await submit({visualizations: [HARMONIC]})

        expect(properties.visualization_0_baseBands).toBe('ndvi')
        expect(properties.visualization_0_bands).toBe('ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse')
    })

    // The generated name joins the bands with ', ' and is then escaped like any other string, so every asset
    // carries backslashes inside its auto-generated names. The escaping itself is correct and is part of the
    // format; that nothing on the read side undoes it for `name` is the defect, and it lives in the parser.
    it('names a visualization by its bands, with the separators escaped', async () => {
        const {properties} = await submit({visualizations: [HARMONIC]})

        expect(properties.visualization_0_name).toBe('ndvi_phase_1\\, ndvi_amplitude_1\\, ndvi_rmse')
    })

    it('keeps an explicit name', async () => {
        const {properties} = await submit({visualizations: [{...NDVI, name: 'Greenness'}]})

        expect(properties.visualization_0_name).toBe('Greenness')
    })

    it('escapes commas inside a value so the list separator stays unambiguous', async () => {
        const {properties} = await submit({
            visualizations: [{
                type: 'categorical',
                name: 'Land cover',
                bands: ['ndvi'],
                values: [1, 2],
                labels: ['Forest, dense', 'Water'],
                palette: ['#00FF00', '#0000FF']
            }]
        })

        expect(properties.visualization_0_labels).toBe('Forest\\, dense,Water')
        expect(properties.visualization_0_values).toBe('1,2')
    })

    it('numbers each visualization in order', async () => {
        const {properties} = await submit({visualizations: [NDVI, HARMONIC]})

        expect(properties.visualization_0_bands).toBe('ndvi')
        expect(properties.visualization_1_bands).toBe('ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse')
    })

    it('keeps only the first of two visualizations sharing a name', async () => {
        const {properties} = await submit({
            visualizations: [NDVI, {...NDVI, palette: ['#000000', '#FFFFFF']}]
        })

        expect(properties.visualization_0_palette).toBe('#FF0000,#00FF00')
        expect(properties.visualization_1_palette).toBeUndefined()
    })
})

// The filter admits visualizations by a LOGICAL band vocabulary - base bands plus every coefficient, timing and
// residual band Slice can derive - which is not the set of bands the asset physically carries. `_coefs` is the
// physical array band and is absent from that vocabulary; `_phase_1` is derived and present.
describe('the band vocabulary a visualization is admitted against', () => {
    const admitted = async visualization =>
        Object.keys(visualizationProperties((await submit({visualizations: [visualization]})).properties)).length > 0

    it('admits a template on derived coefficient bands the asset never physically carries', async () => {
        expect(await admitted(HARMONIC)).toBe(true)
    })

    it('admits templates on rmse and magnitude, which the asset does carry', async () => {
        expect(await admitted({...NDVI, bands: ['ndvi_rmse'], name: 'rmse'})).toBe(true)
        expect(await admitted({...NDVI, bands: ['ndvi_magnitude'], name: 'magnitude'})).toBe(true)
    })

    it('admits templates on the segment bands', async () => {
        expect(await admitted({...NDVI, bands: ['tStart'], name: 'tStart'})).toBe(true)
        expect(await admitted({...NDVI, bands: ['changeProb'], name: 'changeProb'})).toBe(true)
    })

    // The physical array band itself. A visualization naming it is dropped, so no asset carries one.
    it('rejects a template on the physical coefficient array band', async () => {
        expect(await admitted({...NDVI, bands: ['ndvi_coefs'], name: 'coefs'})).toBe(false)
    })

    it('rejects a template naming a band outside the retrieve selection', async () => {
        expect(await admitted({...NDVI, bands: ['swir1'], name: 'swir1'})).toBe(false)
    })

    it('rejects a multi-band template when only some of its bands are selected', async () => {
        expect(await admitted({...NDVI, bands: ['ndvi', 'swir1'], name: 'mixed'})).toBe(false)
    })
})
