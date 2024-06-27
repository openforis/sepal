import _ from 'lodash'

import {pickColors} from './palettePreSets'

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

test('pickColors(${count}, ${colors}) === ${result}')
    .assert(({count, colors, result}) => expect(pickColors(count, colors)).toEqual(result))
    .where(
        {
            count: 2, colors: ['#000000', '#FFFFFF'],
            result: ['#000000', '#FFFFFF']
        },
        {
            count: 1, colors: ['#000000', '#FFFFFF'],
            result: ['#000000']
        },
        {
            count: 2, colors: ['#000000', '#808080', '#FFFFFF'],
            result: ['#000000', '#FFFFFF']
        },
        {
            count: 3, colors: ['#000000', '#808080', '#FFFFFF'],
            result: ['#000000', '#808080', '#FFFFFF']
        },
        {
            count: 3, colors: ['#000000', '#444444', '#666666', '#FFFFFF'],
            result: ['#000000', '#555555', '#FFFFFF']
        },
        {
            count: 3, colors: ['#000000', '#FFFFFF'],
            result: ['#000000', '#808080', '#FFFFFF']
        },
    )

