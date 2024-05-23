import _ from 'lodash'

import {toBandValues} from './cursorValue'

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

const round = array =>
    array.map(value => Number.parseFloat(value).toFixed(3))

test('toBandValues(${rgb}, ${visParams}) === ${result}')
    .assert(({rgb, visParams, result}) => expect(round(toBandValues(rgb, visParams))).toEqual(round(result)))
    .where(
        {
            rgb: [0, 0, 0],
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)']},
            result: [3]
        },
        {
            rgb: [127, 127, 127],
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)']},
            result: [4.992]
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

        {
            rgb: [0, 0, 0],
            visParams: {type: 'categorical', bands: ['index'], values: [1, 2], min: [1], max: [2], palette: ['black', 'white']},
            result: [1]
        },
        {
            rgb: [255, 255, 255],
            visParams: {type: 'categorical', bands: ['index'], values: [1, 2], min: [1], max: [2], palette: ['black', 'white']},
            result: [2]
        },
        {
            rgb: [127, 127, 127],
            visParams: {type: 'categorical', bands: ['index'], values: [1, 2, 3], min: [1], max: [3], palette: ['black', 'green', 'white']},
            result: [2]
        },
        // {
        //     rgb: [177, 95, 131],
        //     visParams: {type: 'categorical', bands: ['index'], values: [5, 200, 1000], min: [5], max: [1000], palette: ['#042333', '#b15f82', '#e8fa5b']},
        //     result: [200]
        // },
    )
