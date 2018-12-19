import _ from 'lodash'
import format from './format'

/* eslint-disable no-undef */

const test = (name) => {
    const nameTemplate = _.template(name)
    return ({
        assert: (assertion) => ({
            where: (...data) =>
                data.forEach(data =>
                    it(nameTemplate(data), () => assertion(data))
                )
        })
    })
}

test('format({value: ${params.value}, scale: \'${params.scale}\'}) === ${result}')
    .assert(({params, result}) => expect(format.number(params)).toEqual(result))
    .where(
        {params: {value: 18245.23, scale: 'k'}, result: '18.2 M'},
        {params: {value: 1000, scale: 'k'}, result: '1.00 M'},
        {params: {value: 18245.23, scale: 'µ'}, result: '18.2 m'},
        {params: {value: 4700.9938, scale: 'p'}, result: '4.70 n'},
        {params: {value: 46920395.334, scale: 'm'}, result: '46.9 k'},
        {params: {value: 1000, scale: 'Z'}, result: '1.00 Y'},
        {params: {value: 999999, scale: 'k'}, result: '1 G'},
        {params: {value: .01, scale: 'G'}, result: '10 M'},
        {params: {value: .00000123, scale: 'G'}, result: '1.23 k'},
        {params: {value: 0}, result: '0'}
    )
