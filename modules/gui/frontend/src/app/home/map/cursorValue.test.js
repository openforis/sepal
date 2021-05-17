import {toBandValues} from './cursorValue'
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

test('toBandValues(${rgb}, ${visParams}) === ${result}')
    .assert(({rgb, visParams, result}) => expect(toBandValues(rgb, visParams)).toEqual(result))
    .where(
        {
            rgb: [0, 0, 0],
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)']},
            result: [3]
        },
        {
            rgb: [127, 127, 127],
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)']},
            result: [4.99]
        },
        {
            rgb: [255, 255, 255],
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)']},
            result: [7]
        },
        {
            rgb: [255, 255, 255],
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['rgb(0, 0, 0)', 'rgb(127,127,127)', 'rgb(255, 255, 255)']},
            result: [7]
        },
        {
            rgb: [127, 127, 127],
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['rgb(0, 0, 0)', 'rgb(127,127,127)', 'rgb(255, 255, 255)']},
            result: [5]
        },

        {
            rgb: [0, 127, 255],
            visParams: {type: 'rgb', bands: ['b1', 'b2', 'b3'], min: [-3, -3, -3], max: [3, 3, 3], gamma: [1, 1, 1]},
            result: [-3, -0.0118, 3]
        },
        {
            rgb: [0, 127, 255],
            visParams: {type: 'rgb', bands: ['b1', 'b2', 'b3'], min: [-3, -3, -3], max: [3, 3, 3], gamma: [1, 1, 1], inverted: [true, true, true]},
            result: [3, 0.0118, -3]
        },
        {
            rgb: [0, 180, 255],
            visParams: {type: 'rgb', bands: ['b1', 'b2', 'b3'], min: [-3, -3, -3], max: [3, 3, 3], gamma: [2, 2, 2]},
            result: [-3, -0.0104, 3]
        },

        {
            rgb: [255, 128, 128],
            visParams: {type: 'hsv', bands: ['b1', 'b2', 'b3'], min: [-3, -3, -3], max: [3, 3, 3], gamma: [1, 1, 1]},
            result: [-3, -0.0118, 3]
        },
        {
            rgb: [255, 180, 180],
            visParams: {type: 'hsv', bands: ['b1', 'b2', 'b3'], min: [-3, -3, -3], max: [3, 3, 3], gamma: [2, 2, 2]},
            result: [-3, 0.0104, 3]
        },
    )
