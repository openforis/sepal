import _ from 'lodash'

import {toVisualizations} from './assetVisualizationParser'

/* eslint-disable no-undef */

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
