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

// Reversing the asset-property encoding.
//
// The Task writer (modules/task/src/ee/visualizations.js) joins array fields with commas and escapes any comma
// inside a value as `\,`. The reader has to undo both. `normalize` splits the fields it knows are lists and
// unescapes `labels`, which leaves two gaps: `baseBands` is not one of its list fields, and a scalar `name` is
// never unescaped. The fixtures below are the exact strings existing assets hold.
describe('decoding persisted asset properties', () => {
    const parse = (properties, bands = ['ndvi', 'red', 'green', 'blue']) => toVisualizations(properties, bands)[0]

    describe('baseBands', () => {
        it('returns a single base band to an array', () => {
            expect(parse({
                visualization_0_type: 'continuous',
                visualization_0_bands: 'ndvi',
                visualization_0_baseBands: 'ndvi'
            }).baseBands).toEqual(['ndvi'])
        })

        it('splits several base bands back apart', () => {
            expect(parse({
                visualization_0_type: 'rgb',
                visualization_0_bands: 'red,green,blue',
                visualization_0_baseBands: 'red,green,blue'
            }).baseBands).toEqual(['red', 'green', 'blue'])
        })

        // The writer escapes each element before joining, so the reader unescapes each element after splitting.
        // No band name has a comma in it today; the decoder is the writer's inverse regardless, and a decoder
        // that split without unescaping would be silently asymmetric.
        it('unescapes each entry, not just the separators between them', () => {
            expect(parse({
                visualization_0_type: 'continuous',
                visualization_0_bands: 'ndvi',
                visualization_0_baseBands: 'one\\, two,three'
            }).baseBands).toEqual(['one, two', 'three'])
        })

        it('is absent when the asset carries none', () => {
            expect(parse({
                visualization_0_type: 'continuous',
                visualization_0_bands: 'ndvi'
            })).not.toHaveProperty('baseBands')
        })
    })

    describe('name', () => {
        // A generated name: the writer joined the bands with ', ' and then escaped those commas.
        it('unescapes the separators inside a generated name', () => {
            expect(parse({
                visualization_0_type: 'rgb',
                visualization_0_bands: 'red,green,blue',
                visualization_0_name: 'red\\, green\\, blue'
            }).name).toBe('red, green, blue')
        })

        it('returns a comma a user typed, without the backslash that carried it', () => {
            expect(parse({
                visualization_0_type: 'continuous',
                visualization_0_bands: 'ndvi',
                visualization_0_name: 'Greenness\\, scaled'
            }).name).toBe('Greenness, scaled')
        })

        it('leaves a name with no comma alone', () => {
            expect(parse({
                visualization_0_type: 'continuous',
                visualization_0_bands: 'ndvi',
                visualization_0_name: 'Greenness'
            }).name).toBe('Greenness')
        })
    })

    // Nothing else about the visualization may shift. This is the whole decoded shape of a real CCDC harmonic
    // template, fields that were already correct included.
    it('decodes only those two fields, leaving every other one as it was', () => {
        expect(parse({
            visualization_0_type: 'hsv',
            visualization_0_bands: 'ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse',
            visualization_0_baseBands: 'ndvi',
            visualization_0_gamma: '1,1,1',
            visualization_0_inverted: 'false,false,true',
            visualization_0_max: '3.141592653589793,3000,2500',
            visualization_0_min: '-3.141592653589793,0,0',
            visualization_0_name: 'ndvi_phase_1\\, ndvi_amplitude_1\\, ndvi_rmse'
        }, ['ndvi'])).toEqual({
            type: 'hsv',
            bands: ['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse'],
            baseBands: ['ndvi'],
            gamma: [1, 1, 1],
            inverted: [false, false, true],
            min: [-3.141592653589793, 0, 0],
            max: [3.141592653589793, 3000, 2500],
            name: 'ndvi_phase_1, ndvi_amplitude_1, ndvi_rmse'
        })
    })

    it('leaves an ordinary asset visualization, which has neither field, exactly as before', () => {
        expect(parse({
            visualization_0_type: 'continuous',
            visualization_0_bands: 'ndvi',
            visualization_0_min: '-10000',
            visualization_0_max: '10000',
            visualization_0_palette: '#112040,#1C67A0,#172313',
            visualization_0_inverted: 'false'
        }, ['ndvi'])).toEqual({
            type: 'continuous',
            bands: ['ndvi'],
            min: [-10000],
            max: [10000],
            palette: ['#112040', '#1C67A0', '#172313'],
            inverted: [false]
        })
    })

    // Already correct, and it must stay that way: `labels` is the one field normalize unescapes on its own.
    it('keeps unescaping the commas inside categorical labels', () => {
        expect(parse({
            visualization_0_type: 'categorical',
            visualization_0_bands: 'class',
            visualization_0_labels: 'Forest\\, dense,Water',
            visualization_0_values: '1,2',
            visualization_0_palette: '#00FF00,#0000FF'
        }, ['class'])).toEqual({
            type: 'categorical',
            bands: ['class'],
            labels: ['Forest, dense', 'Water'],
            values: [1, 2],
            min: [1],
            max: [2],
            palette: ['#00FF00', '#0000FF']
        })
    })

    it('does not touch the properties it was given', () => {
        const properties = {
            visualization_0_type: 'rgb',
            visualization_0_bands: 'red,green,blue',
            visualization_0_baseBands: 'red,green,blue',
            visualization_0_name: 'red\\, green\\, blue'
        }
        const before = {...properties}

        toVisualizations(properties, ['red', 'green', 'blue'])

        expect(properties).toEqual(before)
    })
})

// Failure isolation between candidates.
//
// An asset's visualization metadata is a set of independent candidates: one group of `visualization_N_*`
// properties per serialized entry, plus one per band carrying a complete set of `*_class_*` properties. They are
// written at different times by different code and edited by hand, so one being unusable says nothing about the
// others. Today a single unusable candidate throws out of `normalize` and aborts the whole parse, and the asset
// loses every visualization it has.
//
// Parsing currently throws, so each witness captures the outcome as a value and compares it. A thrown error
// becomes a marker no valid parse can produce, which keeps every failure below a value comparison - "these
// should have survived" - rather than an exception surfacing from the harness. After the fix the helper simply
// returns the array and the same assertions stand.
describe('isolating a malformed visualization from its neighbours', () => {
    const survivors = (properties, bands = []) => {
        try {
            return toVisualizations(properties, bands)
        } catch (error) {
            return {parseAborted: error.constructor.name}
        }
    }

    const named = result => Array.isArray(result)
        ? result.map(({name, bands}) => name || bands.join(','))
        : result

    // A group with no `bands` at all. normalize() drops the empty array and then reads its length.
    const bandless = index => ({
        [`visualization_${index}_type`]: 'continuous',
        [`visualization_${index}_min`]: '0',
        [`visualization_${index}_name`]: 'bandless'
    })

    // A palette entry that is neither a colour name nor six hex digits. Color() throws on it.
    const badPalette = index => ({
        [`visualization_${index}_type`]: 'continuous',
        [`visualization_${index}_bands`]: 'ndvi',
        [`visualization_${index}_palette`]: 'nope',
        [`visualization_${index}_name`]: 'bad palette'
    })

    const valid = (index, band) => ({
        [`visualization_${index}_type`]: 'continuous',
        [`visualization_${index}_bands`]: band,
        [`visualization_${index}_min`]: '0',
        [`visualization_${index}_max`]: '1',
        [`visualization_${index}_name`]: band
    })

    const classProperties = (band, palette) => ({
        [`${band}_class_names`]: 'foo,bar',
        [`${band}_class_values`]: '1,2',
        [`${band}_class_palette`]: palette
    })

    it('keeps the valid entries on either side of a bandless one', () => {
        expect(named(survivors({...valid(0, 'ndvi'), ...bandless(1), ...valid(2, 'evi')})))
            .toEqual(['ndvi', 'evi'])
    })

    it('keeps a valid entry beside one with an unreadable palette', () => {
        expect(named(survivors({...valid(0, 'ndvi'), ...badPalette(1)})))
            .toEqual(['ndvi'])
    })

    it('returns nothing when every serialized entry is malformed', () => {
        expect(survivors({...bandless(0), ...badPalette(1)})).toEqual([])
    })

    it('preserves the order of the survivors', () => {
        const properties = {
            ...valid(0, 'blue'), ...valid(1, 'green'), ...bandless(2), ...valid(3, 'red')
        }

        expect(named(survivors(properties))).toEqual(['blue', 'green', 'red'])
    })

    it('lets a valid class-property visualization through past a malformed serialized one', () => {
        expect(named(survivors({...bandless(0), ...classProperties('cover', 'red,green')}, ['cover'])))
            .toEqual(['cover'])
    })

    it('lets a valid serialized visualization through past a malformed class-property one', () => {
        expect(named(survivors({...valid(0, 'ndvi'), ...classProperties('cover', 'nope,green')}, ['cover'])))
            .toEqual(['ndvi'])
    })

    it('keeps a valid class-property visualization beside a malformed one', () => {
        const properties = {
            ...classProperties('broken', 'nope,green'),
            ...classProperties('cover', 'red,green')
        }

        expect(named(survivors(properties, ['broken', 'cover']))).toEqual(['cover'])
    })

    // The decoding committed in 4a4b65969 has to keep working for the entries that survive.
    it('still decodes baseBands and name on an entry that outlives a malformed sibling', () => {
        const properties = {
            visualization_0_type: 'rgb',
            visualization_0_bands: 'red,green,blue',
            visualization_0_baseBands: 'red,green,blue',
            visualization_0_name: 'red\\, green\\, blue',
            ...bandless(1)
        }

        expect(survivors(properties)).toEqual([{
            type: 'rgb',
            bands: ['red', 'green', 'blue'],
            baseBands: ['red', 'green', 'blue'],
            name: 'red, green, blue',
            inverted: [false, false, false],
            gamma: [1, 1, 1]
        }])
    })

    it('does not touch the properties it was given, malformed entries included', () => {
        const properties = {...valid(0, 'ndvi'), ...bandless(1), ...classProperties('cover', 'nope,green')}
        const before = {...properties}

        survivors(properties, ['cover'])

        expect(properties).toEqual(before)
    })
})

// The second argument is a list of band NAMES, and stays that way. Class properties are found by interpolating
// each entry into `${band}_class_names`, so anything that is not a name silently matches nothing. Callers that
// hold band descriptors have to project them; the parser must not start guessing at object shapes to cover for
// one that does not.
describe('the band list toVisualizations is given', () => {
    const properties = {
        class_class_names: 'Forest,Water',
        class_class_values: '1,2',
        class_class_palette: 'green,blue'
    }

    it('finds the class properties of a band it is named', () => {
        expect(toVisualizations(properties, ['class'])).toEqual([{
            type: 'categorical',
            bands: ['class'],
            labels: ['Forest', 'Water'],
            values: [1, 2],
            min: [1],
            max: [2],
            palette: ['#008000', '#0000FF']
        }])
    })

    it('finds nothing when handed band descriptors instead of names', () => {
        expect(toVisualizations(properties, [{id: 'class', data_type: {precision: 'int'}}])).toEqual([])
    })

    it('finds nothing when handed no band list at all', () => {
        expect(toVisualizations(properties, [])).toEqual([])
    })
})
