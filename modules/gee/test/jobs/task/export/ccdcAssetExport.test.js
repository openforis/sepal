import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {lastValueFrom, of} from 'rxjs'

// What an existing CCDC Segments asset contains. These are characterization tests: they pin the format already
// written into every asset users hold, so that anything reading one later can be held to the same shape.
//
// Only the Earth Engine boundary and the export job are mocked. `formatProperties` and `toVisualizationProperties`
// run for real, because the serialized property strings ARE the contract - a reader parses those exact bytes.

const captured = {}

const geometry = {bounds: () => 'region-bounds'}

mock.module('#sepal/ee/timeSeries/ccdc', {
    exports: {
        default: (recipe, options) => {
            captured.ccdc = {recipe, options}
            return {
                getImage$: () => of('segments-image'),
                getGeometry$: () => of(geometry)
            }
        }
    }
})
mock.module('#gee/jobs/task/export/toAsset', {
    exports: {
        startImageToAssetExport$: args => {
            captured.export = {args}
            return of({eeTaskId: 'T1', assetId: args.assetId})
        }
    }
})

const {startCcdcAssetExport$} = await import('#gee/jobs/task/export/ccdcAssetExport')

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
    await lastValueFrom(startCcdcAssetExport$({
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

        assert.deepEqual(pyramidingPolicy, {'.default': 'sample'})
        assert.equal(maxPixels, 1e13)
        assert.equal(region, 'region-bounds')
        assert.equal(scale, 30)
        assert.equal(image, 'segments-image')
    })

    it('passes the retrieve band selection to the segment builder', async () => {
        await submit({bands: ['ndvi', 'swir1']})

        assert.deepEqual(captured.ccdc.options, {selection: ['ndvi', 'swir1']})
    })
})

// Of the properties written here, CCDC Slice reads exactly three: dateFormat, startDate and endDate. Everything
// else it needs it derives from the asset's band names.
describe('the date metadata CCDC Slice reads back', () => {
    it('records the segment date range and date format', async () => {
        const {properties} = await submit()

        assert.equal(properties.startDate, '2015-01-01')
        assert.equal(properties.endDate, '2020-01-01')
        assert.equal(properties.dateFormat, 1)
    })

})

// Written into every asset, read by nothing in Slice. Its three-valued shape is recorded because a future reader
// would have to cope with all three - and one of the two real assets omits it entirely.
describe('the surface reflectance flag, which Slice does not read', () => {
    it('records surface reflectance as 1 when the correction was applied', async () => {
        const {properties} = await submit({model: recipe({corrections: ['SR']})})

        assert.equal(properties.surfaceReflectance, 1)
    })

    // Not 0 and not absent - `corrections.includes('SR') && 1` yields the boolean.
    it('records surface reflectance as false when it was not', async () => {
        const {properties} = await submit({model: recipe({corrections: []})})

        assert.equal(properties.surfaceReflectance, false)
    })

    it('records it as undefined when the recipe carries no corrections at all', async () => {
        const model = recipe()
        delete model.model.options.corrections
        const {properties} = await submit({model})

        assert.equal(properties.surfaceReflectance, undefined)
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

        assert.deepEqual(properties.formattedProperties, {
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

        assert.equal(properties.recipe_id, undefined)
        assert.equal(properties.formattedProperties.recipe_id, 'ccdc-1')
    })
})

describe('the serialized visualizations', () => {
    it('writes every field of a visualization, one property per key', async () => {
        const {properties} = await submit({visualizations: [NDVI]})

        assert.deepEqual(visualizationProperties(properties), {
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

        assert.equal(typeof properties.visualization_0_min, 'string')
        assert.equal(typeof properties.visualization_0_inverted, 'string')
    })

    // baseBands is not a rendering parameter. It says which logical CCDC band the template belongs to, and it is
    // serialized like any other field because the writer serializes whatever the visualization carries.
    it('carries baseBands through as an ordinary field', async () => {
        const {properties} = await submit({visualizations: [HARMONIC]})

        assert.equal(properties.visualization_0_baseBands, 'ndvi')
        assert.equal(
            properties.visualization_0_bands,
            'ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse'
        )
    })

    // The generated name joins the bands with ', ' and is then escaped like any other string, so every asset
    // carries backslashes inside its auto-generated names. The escaping itself is correct and is part of the
    // format; that nothing on the read side undoes it for `name` is the defect, and it lives in the parser.
    it('names a visualization by its bands, with the separators escaped', async () => {
        const {properties} = await submit({visualizations: [HARMONIC]})

        assert.equal(
            properties.visualization_0_name,
            'ndvi_phase_1\\, ndvi_amplitude_1\\, ndvi_rmse'
        )
    })

    it('keeps an explicit name', async () => {
        const {properties} = await submit({visualizations: [{...NDVI, name: 'Greenness'}]})

        assert.equal(properties.visualization_0_name, 'Greenness')
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

        assert.equal(properties.visualization_0_labels, 'Forest\\, dense,Water')
        assert.equal(properties.visualization_0_values, '1,2')
    })

    it('numbers each visualization in order', async () => {
        const {properties} = await submit({visualizations: [NDVI, HARMONIC]})

        assert.equal(properties.visualization_0_bands, 'ndvi')
        assert.equal(
            properties.visualization_1_bands,
            'ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse'
        )
    })

    it('keeps only the first of two visualizations sharing a name', async () => {
        const {properties} = await submit({
            visualizations: [NDVI, {...NDVI, palette: ['#000000', '#FFFFFF']}]
        })

        assert.equal(properties.visualization_0_palette, '#FF0000,#00FF00')
        assert.equal(properties.visualization_1_palette, undefined)
    })
})

// The filter admits visualizations by a LOGICAL band vocabulary - base bands plus every coefficient, timing and
// residual band Slice can derive - which is not the set of bands the asset physically carries. `_coefs` is the
// physical array band and is absent from that vocabulary; `_phase_1` is derived and present.
describe('the band vocabulary a visualization is admitted against', () => {
    const admitted = async visualization =>
        Object.keys(visualizationProperties((await submit({visualizations: [visualization]})).properties)).length > 0

    it('admits a template on derived coefficient bands the asset never physically carries', async () => {
        assert.equal(await admitted(HARMONIC), true)
    })

    it('admits templates on rmse and magnitude, which the asset does carry', async () => {
        assert.equal(await admitted({...NDVI, bands: ['ndvi_rmse'], name: 'rmse'}), true)
        assert.equal(
            await admitted({...NDVI, bands: ['ndvi_magnitude'], name: 'magnitude'}),
            true
        )
    })

    it('admits templates on the segment bands', async () => {
        assert.equal(await admitted({...NDVI, bands: ['tStart'], name: 'tStart'}), true)
        assert.equal(await admitted({...NDVI, bands: ['changeProb'], name: 'changeProb'}), true)
    })

    // The physical array band itself. A visualization naming it is dropped, so no asset carries one.
    it('rejects a template on the physical coefficient array band', async () => {
        assert.equal(await admitted({...NDVI, bands: ['ndvi_coefs'], name: 'coefs'}), false)
    })

    it('rejects a template naming a band outside the retrieve selection', async () => {
        assert.equal(await admitted({...NDVI, bands: ['swir1'], name: 'swir1'}), false)
    })

    it('rejects a multi-band template when only some of its bands are selected', async () => {
        assert.equal(await admitted({...NDVI, bands: ['ndvi', 'swir1'], name: 'mixed'}), false)
    })
})
