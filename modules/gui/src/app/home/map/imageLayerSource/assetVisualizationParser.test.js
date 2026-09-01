import _ from 'lodash'

import {toVisualizations} from './assetVisualizationParser'

const test = name => {
    const nameTemplate = _.template(name)
    return ({
        assert: assertion => ({
            where: (...data) =>
                data.forEach(data => {
                    const args = {}
                    Object.keys(data).forEach(key => args[key] =
                        JSON.stringify(data[key])
                    )
                    it(nameTemplate(args), () => assertion(data))
                }
                )
        })
    })
}

test('toVisualizations(${properties}, ${bands}) === ${result}')
    .assert(({properties, bands, result}) => expect(toVisualizations(properties, bands)).toEqual(result))
    .where(
        {
            properties: {
                unrelated: 'property',
                visualization_0_type: 'rgb',
                visualization_0_name: 'RGB',
                visualization_0_bands: 'red,green,blue',
                visualization_0_min: 0,
                visualization_0_max: 1,
                visualization_0_gamma: 2,
            },
            bands: ['red', 'green', 'blue'],
            result: [
                {
                    type: 'rgb',
                    name: 'RGB',
                    bands: ['red', 'green', 'blue'],
                    min: [0, 0, 0],
                    max: [1, 1, 1],
                    gamma: [2, 2, 2],
                    inverted: [false, false, false]
                }
            ]
        },
        {
            properties: {
                unrelated: 'property',
                visualization_1_type: 'continuous',
                visualization_1_name: 'Single band',
                visualization_1_bands: 'ndvi',
                visualization_1_min: 10,
                visualization_1_max: 20,
                visualization_1_palette: 'white,black',
                visualization_0_type: 'rgb',
                visualization_0_name: 'RGB',
                visualization_0_bands: 'red,green,blue',
                visualization_0_min: 0,
                visualization_0_max: 1,
                visualization_0_gamma: 2,
            },
            bands: ['red', 'green', 'blue'],
            result: [
                {
                    type: 'rgb',
                    name: 'RGB',
                    bands: ['red', 'green', 'blue'],
                    min: [0, 0, 0],
                    max: [1, 1, 1],
                    gamma: [2, 2, 2],
                    inverted: [false, false, false]
                },
                {
                    type: 'continuous',
                    name: 'Single band',
                    bands: ['ndvi'],
                    min: [10],
                    max: [20],
                    palette: ['#FFFFFF', '#000000'],
                    inverted: [false]
                },
            ]
        },
        {
            properties: {},
            bands: ['foo'],
            result: []
        },
        {
            properties: {
                b_class_names: 'foo,bar,baz',
                b_class_values: '5,13,17',
                b_class_palette: 'red,green,blue',
                c_class_names: 'foo,bar,baz',
                c_class_values: '5,13,17',
                c_class_palette: 'red,green,blue',
            },
            bands: ['a', 'b', 'c'],
            result: [
                {
                    type: 'categorical',
                    bands: ['b'],
                    min: [5],
                    max: [17],
                    values: [5, 13, 17],
                    labels: ['foo', 'bar', 'baz'],
                    palette: ['#FF0000', '#008000', '#0000FF']
                },
                {
                    type: 'categorical',
                    bands: ['c'],
                    min: [5],
                    max: [17],
                    values: [5, 13, 17],
                    labels: ['foo', 'bar', 'baz'],
                    palette: ['#FF0000', '#008000', '#0000FF']
                }
            ]
        },
        // {
        //     properties: {
        //         visualization_0_type: 'categorical',
        //         visualization_0_bands: 'class',
        //         visualization_0_labels: 'a\\,label, b\\,label',
        //         visualization_0_values: '1, 2',
        //         visualization_0_palette: 'white,black',
        //     },
        //     bands: ['class'],
        //     result: [
        //         {
        //             type: 'categorical',
        //             bands: ['class'],
        //             min: [1],
        //             max: [2],
        //             labels: ['a,label', 'b,label'],
        //             values: [1, 2],
        //             palette: ['#FFFFFF', '#000000']
        //         }
        //     ]
        // },
    )

// Round-tripping the properties of a real, existing CCDC asset (users/wiell/amazonas_ccdc, written October
// 2021). These are the exact strings the asset carries, so what the parser makes of them describes every asset
// like it.
//
// Several results below are DEFECTS, marked as such. They are pinned so a fix can be measured against them - the
// serialization format is the compatibility requirement, not the parser's current mistakes about it.
describe('a legacy CCDC asset', () => {
    // Physical bands. The asset carries a `_coefs` array band per measure, never the coefficient bands by name.
    const BANDS = [
        'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
        'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude'
    ]

    const HARMONIC = {
        visualization_11_type: 'hsv',
        visualization_11_bands: 'ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse',
        visualization_11_baseBands: 'ndvi',
        visualization_11_gamma: '1,1,1',
        visualization_11_inverted: 'false,false,true',
        visualization_11_max: '3.141592653589793,3000,2500',
        visualization_11_min: '-3.141592653589793,0,0',
        visualization_11_name: 'ndvi_phase_1\\, ndvi_amplitude_1\\, ndvi_rmse'
    }

    const CONTINUOUS = {
        visualization_6_type: 'continuous',
        visualization_6_bands: 'ndvi',
        visualization_6_baseBands: 'ndvi',
        visualization_6_inverted: 'false',
        visualization_6_max: '10000',
        visualization_6_min: '-10000',
        visualization_6_name: 'ndvi',
        visualization_6_palette: '#112040,#1C67A0,#6DB6B3,#FFFCCC,#ABAC21,#177228,#172313'
    }

    const RGB = {
        visualization_0_type: 'rgb',
        visualization_0_bands: 'red,green,blue',
        visualization_0_baseBands: 'red,green,blue',
        visualization_0_gamma: '1.3,1.3,1.3',
        visualization_0_inverted: 'false,false,false',
        visualization_0_max: '2500,2500,2300',
        visualization_0_min: '300,100,0',
        visualization_0_name: 'red\\, green\\, blue'
    }

    const parse = properties => toVisualizations(properties, BANDS)

    it('reads a harmonic template naming bands the asset does not physically carry', () => {
        expect(parse(HARMONIC)[0]).toEqual({
            type: 'hsv',
            bands: ['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse'],
            baseBands: 'ndvi',
            gamma: [1, 1, 1],
            inverted: [false, false, true],
            min: [-3.141592653589793, 0, 0],
            max: [3.141592653589793, 3000, 2500],
            name: 'ndvi_phase_1\\, ndvi_amplitude_1\\, ndvi_rmse'
        })
    })

    // DEFECT. `baseBands` is not in the parser's list of list-valued keys, so it comes back as the raw string
    // the asset holds - `'red,green,blue'`, not `['red','green','blue']` - while the same field built inside a
    // CCDC recipe is an array. The asset is well formed; the parser fails to split it.
    it('returns baseBands as an unsplit string, not the array it was written from', () => {
        expect(parse(HARMONIC)[0].baseBands).toBe('ndvi')
        expect(parse(RGB)[0].baseBands).toBe('red,green,blue')
    })

    // DEFECT. Only `labels` is unescaped on the way back in, so a generated name keeps the backslashes the
    // writer correctly put in, and every such asset displays them. The escaping is right; the unescaping is
    // missing.
    it('leaves the escaped separators inside a generated name', () => {
        expect(parse(RGB)[0].name).toBe('red\\, green\\, blue')
    })

    it('parses an ordinary continuous band template unchanged by the CCDC fields beside it', () => {
        expect(parse(CONTINUOUS)[0]).toEqual({
            type: 'continuous',
            bands: ['ndvi'],
            baseBands: 'ndvi',
            inverted: [false],
            min: [-10000],
            max: [10000],
            name: 'ndvi',
            palette: ['#112040', '#1C67A0', '#6DB6B3', '#FFFCCC', '#ABAC21', '#177228', '#172313']
        })
    })

    it('parses an ordinary rgb template unchanged by the CCDC fields beside it', () => {
        expect(parse(RGB)[0]).toEqual({
            type: 'rgb',
            bands: ['red', 'green', 'blue'],
            baseBands: 'red,green,blue',
            gamma: [1.3, 1.3, 1.3],
            inverted: [false, false, false],
            min: [300, 100, 0],
            max: [2500, 2500, 2300],
            name: 'red\\, green\\, blue'
        })
    })

    // Indices are ordered numerically because lodash groups them into integer-like object keys, not because
    // anything sorts them; the property order in the asset is irrelevant.
    it('orders visualizations by index and closes the gaps between them', () => {
        const parsed = parse({...HARMONIC, ...CONTINUOUS, ...RGB})

        expect(parsed).toHaveLength(3)
        expect(parsed.map(({type}) => type)).toEqual(['rgb', 'continuous', 'hsv'])
    })

    it('ignores properties that are not visualizations', () => {
        expect(parse({dateFormat: 1, startDate: '2015-01-01', surfaceReflectance: 1})).toEqual([])
    })
})

// Recorded, not corrected. These are the shapes a hand-edited or foreign asset can present today.
describe('malformed and unsupported visualization properties', () => {
    // DEFECT. Not dropped - it crashes the parse. normalize() deletes `bands` as an empty array and then reads
    // its length, so one bandless property group takes down every visualization in the asset with it. A
    // malformed entry should fail alone.
    it('throws on a visualization that names no bands, rather than dropping it', () => {
        expect(() => toVisualizations({visualization_0_type: 'continuous', visualization_0_min: '0'}, ['a']))
            .toThrow(TypeError)
    })

    it('keeps an unrecognized field verbatim rather than rejecting the visualization', () => {
        expect(toVisualizations({
            visualization_0_bands: 'a',
            visualization_0_type: 'continuous',
            visualization_0_somethingElse: 'kept'
        }, ['a'])[0].somethingElse).toBe('kept')
    })

    // DEFECT, same blast radius: one bad colour loses every visualization the asset has.
    it('throws on a palette entry that is not a colour, losing every visualization in the asset', () => {
        expect(() => toVisualizations({
            visualization_0_bands: 'a',
            visualization_0_type: 'continuous',
            visualization_0_palette: 'not-a-colour'
        }, ['a'])).toThrow()
    })

    it('needs all three class properties before it derives a categorical visualization', () => {
        expect(toVisualizations({b_class_names: 'foo', b_class_values: '1'}, ['b'])).toEqual([])
    })

    // DEFECT, at the call site rather than here: assetCombo passes `metadata.bands` - band OBJECTS - where this
    // wants band names, so `${band}_class_names` interpolates to `[object Object]_class_names` and no asset
    // loaded through the asset picker ever gets a categorical visualization from class properties.
    it('finds no class properties when handed band objects instead of band names', () => {
        const properties = {b_class_names: 'foo', b_class_values: '1', b_class_palette: 'red'}

        expect(toVisualizations(properties, ['b'])).toHaveLength(1)
        expect(toVisualizations(properties, [{id: 'b'}])).toEqual([])
    })
})
