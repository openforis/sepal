import _ from 'lodash'

import {normalize} from './visParams'

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

test('normalize(${visParams}) === ${result}')
    .assert(({visParams, result}) => expect(normalize(visParams)).toEqual(result))
    .where(
        {
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['#000000', '#FFFFFF'], inverted: [false]},
            result: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['#000000', '#FFFFFF'], inverted: [false]}
        },
        { // To array
            visParams: {type: 'continuous', bands: 'index', min: 3, max: 7, palette: ['#000000', '#FFFFFF'], inverted: false},
            result: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['#000000', '#FFFFFF'], inverted: [false]}
        },
        { // Convert palette to hex
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['black', 'white'], inverted: [false]},
            result: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['#000000', '#FFFFFF'], inverted: [false]}
        },
        { // Add missing has to hex color
            visParams: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['000000', 'FFFFFF'], inverted: [false]},
            result: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['#000000', '#FFFFFF'], inverted: [false]}
        },
        { // Split comma separated strings
            visParams: {type: 'rgb', bands: 'a,b,c', min: '1,2,3', max: '4,5,6', gamma: '1, 2, 3', inverted: 'false, true, false'},
            result: {type: 'rgb', bands: ['a', 'b', 'c'], min: [1, 2, 3], max: [4, 5, 6], gamma: [1, 2, 3], inverted: [false, true, false]}
        },
        { // Repeat values
            visParams: {type: 'rgb', bands: ['a', 'b', 'c'], min: [1], max: [4], gamma: [1], inverted: [false]},
            result: {type: 'rgb', bands: ['a', 'b', 'c'], min: [1, 1, 1], max: [4, 4, 4], gamma: [1, 1, 1], inverted: [false, false, false]}
        },
        { // Crop array
            visParams: {type: 'continuous', bands: ['index'], min: [1, 2, 3], max: [4, 5, 6], palette: ['#000000', '#FFFFFF'], inverted: [false, true, false]},
            result: {type: 'continuous', bands: ['index'], min: [1], max: [4], palette: ['#000000', '#FFFFFF'], inverted: [false]}
        },
        { // Add missing gamma and inverted
            visParams: {type: 'rgb', bands: ['a', 'b', 'c'], min: [1, 1, 1], max: [4, 4, 4]},
            result: {type: 'rgb', bands: ['a', 'b', 'c'], min: [1, 1, 1], max: [4, 4, 4], gamma: [1, 1, 1], inverted: [false, false, false]}
        },
        { // Add min, max
            visParams: {type: 'categorical', bands: ['a'], values: [5, 200, 1000], labels: 'foo, bar, baz', palette: ['#FF0000', '#00FF00', '#0000FF']},
            result: {type: 'categorical', bands: ['a'], min: [5], max: [1000], values: [5, 200, 1000], labels: ['foo', 'bar', 'baz'], palette: ['#FF0000', '#00FF00', '#0000FF']}
        },
        { // Add type rgb when multiple bands
            visParams: {bands: ['a', 'b', 'c'], min: [1, 2, 3], max: [4, 5, 6], gamma: [1, 2, 3], inverted: [false, true, false]},
            result: {type: 'rgb', bands: ['a', 'b', 'c'], min: [1, 2, 3], max: [4, 5, 6], gamma: [1, 2, 3], inverted: [false, true, false]}
        },
        { // Add type continuous when single band and no values
            visParams: {bands: ['index'], min: [3], max: [7], palette: ['#000000', '#FFFFFF'], inverted: [false]},
            result: {type: 'continuous', bands: ['index'], min: [3], max: [7], palette: ['#000000', '#FFFFFF'], inverted: [false]}
        },
        { // Add type categorical when single band and values
            visParams: {bands: ['a'], min: [5], max: [1000], values: [5, 200, 1000], palette: ['#FF0000', '#00FF00', '#0000FF']},
            result: {type: 'categorical', bands: ['a'], min: [5], max: [1000], values: [5, 200, 1000], palette: ['#FF0000', '#00FF00', '#0000FF']}
        },
    )
