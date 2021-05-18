import {toVisualizations} from './assetVisualizationParser'
import _ from 'lodash'

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

test('toVisualizations(${properties}) === ${result}')
    .assert(({properties, result}) => expect(toVisualizations(properties)).toEqual(result))
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
            result: []
        },
    )
