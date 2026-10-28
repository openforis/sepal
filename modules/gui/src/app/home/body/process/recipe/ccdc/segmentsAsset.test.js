import {describe, expect, it} from 'vitest'

import {segmentsAssetDescription} from './segmentsAsset'

// What a reader of CCDC segments makes of an existing Earth Engine asset. The fixtures are taken from real
// ones - users/wiell/amazonas_ccdc and users/wiell/ayeyarwadi_ccdc_optical, written October and December 2021 -
// so what passes here describes every asset already in users' hands.
//
// The description reconstructs candidates. It does not admit, verify or classify anything, and these tests
// must not be read as saying an asset IS a CCDC Segments image. Three separate things come out of one metadata
// document, and the tests keep them apart on purpose:
//
//   reconstructed structure  base bands and segment bands, derived from band names alone
//   date metadata            dateFormat, startDate, endDate - the only properties a reader takes
//   presentation templates   the visualization_* properties, which contribute to neither

// The real asset's bands, trimmed to three measures. `<measure>_coefs` is one physical array band standing for
// nine logical coefficient bands.
const REAL_BANDS = [
    'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
    'blue_coefs', 'blue_rmse', 'blue_magnitude',
    'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude',
    'nbr_coefs', 'nbr_rmse', 'nbr_magnitude'
]

const COEFFICIENT_TYPES = [
    'value', 'intercept', 'slope',
    'phase_1', 'amplitude_1', 'phase_2', 'amplitude_2', 'phase_3', 'amplitude_3'
]

const metadataOf = ({bandNames = REAL_BANDS, properties = {}} = {}) => ({bandNames, properties})

const describeAsset = args => segmentsAssetDescription(metadataOf(args))

describe('the structure reconstructed from band names', () => {
    it('reads one base band per measure, whatever order the bands arrive in', () => {
        expect(describeAsset().baseBands.map(({name}) => name)).toEqual(['blue', 'ndvi', 'nbr'])
    })

    it('expands the physical coefficient array band into the nine measures a slice derives from it', () => {
        const {measures} = describeAsset({bandNames: ['ndvi_coefs']}).baseBands[0]

        expect(measures).toEqual(COEFFICIENT_TYPES)
    })

    it('adds rmse and magnitude as further measures of the same base band', () => {
        const {measures} = describeAsset({bandNames: ['ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']}).baseBands[0]

        expect(measures).toEqual([...COEFFICIENT_TYPES, 'rmse', 'magnitude'])
    })

    it('orders measures by the physical band order, not by any fixed list', () => {
        const {measures} = describeAsset({bandNames: ['ndvi_magnitude', 'ndvi_rmse', 'ndvi_coefs']}).baseBands[0]

        expect(measures).toEqual(['magnitude', 'rmse', ...COEFFICIENT_TYPES])
    })

    it('reads the segment bands, keeping the asset order', () => {
        expect(describeAsset().segmentBands).toEqual([
            {name: 'tStart'}, {name: 'tEnd'}, {name: 'tBreak'}, {name: 'numObs'}, {name: 'changeProb'}
        ])
    })

    it('treats a measure named like a segment band as a segment band only', () => {
        expect(describeAsset({bandNames: ['tStart']}).baseBands).toEqual([])
    })

    // Nothing here checks that the result is coherent: one stray suffixed band yields a base band with a single
    // type, which no CCDC image would ever have. Reconstruction, not admission.
    it('reconstructs a base band from a lone suffixed band, coherent or not', () => {
        expect(describeAsset({bandNames: ['x_rmse']}).baseBands).toEqual([{name: 'x', measures: ['rmse']}])
    })

    it('ignores a band that is neither a measure nor a segment band', () => {
        const source = describeAsset({bandNames: ['count', 'ndvi_coefs', 'someOtherBand']})

        expect(source.baseBands.map(({name}) => name)).toEqual(['ndvi'])
        expect(source.segmentBands).toEqual([])
    })

    // Recorded, not corrected: nothing deduplicates measures, so a repeated physical band repeats its measure.
    it('repeats a measure when the same physical band appears twice', () => {
        const {measures} = describeAsset({bandNames: ['ndvi_rmse', 'ndvi_rmse']}).baseBands[0]

        expect(measures).toEqual(['rmse', 'rmse'])
    })

    // The base band name is matched greedily, so a suffix that looks like two stacked measures is read as a
    // base band whose name ends in one of them.
    it('takes the longest possible base band name from a doubly suffixed band', () => {
        expect(describeAsset({bandNames: ['ndvi_rmse_magnitude']}).baseBands).toEqual([
            {name: 'ndvi_rmse', measures: ['magnitude']}
        ])
    })

    it('carries the physical band names through untouched', () => {
        expect(describeAsset().bands).toBe(REAL_BANDS)
    })

    // No provenance marker, no recipe id, no asset-type property is needed or consulted.
    it('describes an asset that carries no properties at all', () => {
        const source = describeAsset({properties: {}})

        expect(source.baseBands.map(({name}) => name)).toEqual(['blue', 'ndvi', 'nbr'])
        expect(source.segmentBands).toHaveLength(5)
        expect(source.visualizations).toEqual([])
    })
})

describe('the date metadata a reader takes', () => {
    const PROPERTIES = {dateFormat: 1, startDate: '2015-01-01', endDate: '2021-10-27', surfaceReflectance: 1}

    it('takes the date format and segment date range straight from the asset properties', () => {
        const source = describeAsset({properties: PROPERTIES})

        expect(source.dateFormat).toBe(1)
        expect(source.startDate).toBe('2015-01-01')
        expect(source.endDate).toBe('2021-10-27')
    })

    // surfaceReflectance is written by the CCDC export and carried by real assets, but nothing reads it.
    it('drops surfaceReflectance, which no reader takes', () => {
        expect(describeAsset({properties: PROPERTIES}).surfaceReflectance).toBeUndefined()
    })

    // Absent date metadata is not refused. The description is still built; the date panel and the break-date
    // visualizations are what go without.
    it('describes the asset even when the date properties are missing', () => {
        const source = describeAsset({properties: {}})

        expect(source.dateFormat).toBeUndefined()
        expect(source.startDate).toBeUndefined()
        expect(source.baseBands.map(({name}) => name)).toEqual(['blue', 'ndvi', 'nbr'])
    })
})

describe('the presentation templates', () => {
    const HARMONIC = {
        visualization_0_type: 'hsv',
        visualization_0_bands: 'ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse',
        visualization_0_baseBands: 'ndvi',
        visualization_0_gamma: '1,1,1',
        visualization_0_inverted: 'false,false,true',
        visualization_0_max: '3.141592653589793,3000,2500',
        visualization_0_min: '-3.141592653589793,0,0'
    }

    it('keeps a template whose bands the asset does not physically carry', () => {
        const [visualization] = describeAsset({properties: HARMONIC}).visualizations

        expect(visualization.bands).toEqual(['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse'])
    })

    it('keeps the baseBands field that says which measure the template belongs to', () => {
        expect(describeAsset({properties: HARMONIC}).visualizations[0].baseBands).toEqual(['ndvi'])
    })

    // Visualization properties contribute to no structural field. CCDC-shaped ones on an asset whose band names
    // say otherwise produce templates and nothing else.
    it('contributes nothing to the reconstructed structure', () => {
        const source = segmentsAssetDescription(metadataOf({
            bandNames: ['red', 'green', 'blue'],
            properties: {
                visualization_0_type: 'rgb',
                visualization_0_bands: 'red,green,blue',
                visualization_0_baseBands: 'red,green,blue'
            }
        }))

        expect(source.visualizations).toHaveLength(1)
        expect(source.baseBands).toEqual([])
        expect(source.segmentBands).toEqual([])
    })

    // Identified per read: the same asset read twice yields templates that differ only by id. Which template a
    // saved selection means is settled where a read is compared with the one before it - see sliceObservation.
    it('mints a new id for every template on every read', () => {
        const first = describeAsset({properties: HARMONIC}).visualizations[0]
        const second = describeAsset({properties: HARMONIC}).visualizations[0]

        expect(first.id).toEqual(expect.any(String))
        expect(second.id).not.toBe(first.id)
        expect({...first, id: null}).toEqual({...second, id: null})
    })
})

// A whole existing asset, exactly as Earth Engine reports it: the 38 physical bands and the properties of
// users/wiell/amazonas_ccdc. Nothing was added to it and nothing needs to be - no provenance marker, no recipe
// id, no rewrite. This is the direct-asset compatibility case.
describe('a real legacy CCDC asset, unmodified', () => {
    const MEASURES = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'ndvi', 'ndmi', 'ndwi', 'ndfi', 'nbr']

    const AMAZONAS = {
        bandNames: [
            'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
            ...MEASURES.map(measure => [`${measure}_coefs`, `${measure}_rmse`, `${measure}_magnitude`]).flat()
        ],
        properties: {
            dateFormat: 1,
            startDate: '2015-01-01',
            endDate: '2021-10-27',
            scale: 30,
            surfaceReflectance: 1,
            'system:version': 1635340957222000,
            'system:time_start': 1420070400000,
            'system:time_end': 1635292800000,
            visualization_0_type: 'rgb',
            visualization_0_bands: 'red,green,blue',
            visualization_0_baseBands: 'red,green,blue',
            visualization_0_gamma: '1.3,1.3,1.3',
            visualization_0_inverted: 'false,false,false',
            visualization_0_max: '2500,2500,2300',
            visualization_0_min: '300,100,0',
            visualization_0_name: 'red\\, green\\, blue',
            visualization_6_type: 'continuous',
            visualization_6_bands: 'ndvi',
            visualization_6_baseBands: 'ndvi',
            visualization_6_inverted: 'false',
            visualization_6_max: '10000',
            visualization_6_min: '-10000',
            visualization_6_name: 'ndvi',
            visualization_6_palette: '#112040,#1C67A0,#6DB6B3,#FFFCCC,#ABAC21,#177228,#172313',
            visualization_11_type: 'hsv',
            visualization_11_bands: 'ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse',
            visualization_11_baseBands: 'ndvi',
            visualization_11_gamma: '1,1,1',
            visualization_11_inverted: 'false,false,true',
            visualization_11_max: '3.141592653589793,3000,2500',
            visualization_11_min: '-3.141592653589793,0,0',
            visualization_11_name: 'ndvi_phase_1\\, ndvi_amplitude_1\\, ndvi_rmse'
        }
    }

    const source = () => segmentsAssetDescription(AMAZONAS)

    const withoutTemplateIds = description => ({
        ...description,
        visualizations: description.visualizations.map(({id: _id, ...rest}) => rest)
    })

    it('has 38 bands: five segment bands and three per measure', () => {
        expect(AMAZONAS.bandNames).toHaveLength(38)
    })

    // Every field a reader of segments takes, in one place.
    it('produces the complete description a reader consumes', () => {
        const {bands, baseBands, segmentBands, dateFormat, startDate, endDate, visualizations} = source()

        expect(bands).toHaveLength(38)
        expect(baseBands.map(({name}) => name)).toEqual(MEASURES)
        expect(segmentBands.map(({name}) => name))
            .toEqual(['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'])
        expect(dateFormat).toBe(1)
        expect(startDate).toBe('2015-01-01')
        expect(endDate).toBe('2021-10-27')
        expect(visualizations).toHaveLength(3)
    })

    it('gives every base band the eleven measures a slice can produce', () => {
        source().baseBands.forEach(({measures}) =>
            expect(measures).toEqual([...COEFFICIENT_TYPES, 'rmse', 'magnitude'])
        )
    })

    // Earth Engine stamps `system:version` on every asset and bumps it on every write. It is the only thing in
    // the metadata that says WHICH revision of an asset was read - the two real assets carry 1635340957222000
    // and 1639500957886000. Nothing in the current code reads it.
    it('discards the asset revision, keeping it out of the persisted source', () => {
        const {properties} = AMAZONAS

        expect(properties['system:version']).toBe(1635340957222000)
        expect(Object.keys(source())).toEqual([
            'bands', 'baseBands', 'segmentBands',
            'dateFormat', 'startDate', 'endDate', 'visualizations'
        ])
    })

    // The second real asset, whose only structural difference is two fewer measures. Its revision differs, and
    // that difference reaches nothing.
    it('produces the same shape for the second real asset, revision aside', () => {
        const measures = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'ndvi', 'ndmi', 'ndwi']
        const ayeyarwadi = segmentsAssetDescription({
            bandNames: [
                'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
                ...measures.map(measure => [`${measure}_coefs`, `${measure}_rmse`, `${measure}_magnitude`]).flat()
            ],
            properties: {
                dateFormat: 1,
                startDate: '2017-04-24',
                endDate: '2021-12-14',
                scale: 30,
                'system:version': 1639500957886000
            }
        })

        expect(ayeyarwadi.bands).toHaveLength(32)
        expect(ayeyarwadi.baseBands.map(({name}) => name)).toEqual(measures)
        expect(ayeyarwadi.dateFormat).toBe(1)
        expect(Object.keys(ayeyarwadi)).toEqual(Object.keys(source()))
    })

    // surfaceReflectance is present on the October asset and absent on the December one, so a reader cannot
    // treat it as always available.
    it('does not require surfaceReflectance, which one of the two real assets omits', () => {
        const {surfaceReflectance: _sr, ...withoutSr} = AMAZONAS.properties
        const stripped = segmentsAssetDescription({...AMAZONAS, properties: withoutSr})

        // Template ids cannot take part in the comparison: they are minted afresh on every read.
        expect(withoutTemplateIds(stripped)).toEqual(withoutTemplateIds(source()))
    })

    it('needs no property beyond the three date fields to be recognized', () => {
        const {properties: _properties, ...withoutProperties} = AMAZONAS
        const stripped = segmentsAssetDescription({...withoutProperties, properties: {}})

        expect(stripped.baseBands).toEqual(source().baseBands)
        expect(stripped.segmentBands).toEqual(source().segmentBands)
    })
})
