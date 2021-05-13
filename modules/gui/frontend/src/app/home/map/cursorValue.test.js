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
    )
