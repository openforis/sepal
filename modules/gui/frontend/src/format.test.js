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
        {params: {value: 0}, result: '0'},
        {params: {value: 1000000}, result: '1.00 M'},
        {params: {value: 100000}, result: '100 k'},
        {params: {value: 10000}, result: '10.0 k'},
        {params: {value: 1000}, result: '1.00 k'},
        {params: {value: 100}, result: '100'},
        {params: {value: 10}, result: '10.0'},
        {params: {value: 1}, result: '1.00'},
        {params: {value: .1}, result: '100 m'},
        {params: {value: .01}, result: '10.0 m'},
        {params: {value: .001}, result: '1.00 m'},
        {params: {value: .0001}, result: '100 µ'},
        {params: {value: .00001}, result: '10.0 µ'},
        {params: {value: .000001}, result: '1.00 µ'},
        {params: {value: 1.23456, scale: 'k'}, result: '1.23 k'},
        {params: {value: 12.3456}, result: '12.3'},
        {params: {value: 123.456}, result: '123'},
        {params: {value: 1234.56, scale: 'M'}, result: '1.23 G'},
        {params: {value: 12345.6, scale: 'µ'}, result: '12.3 m'},
        {params: {value: 123456, scale: 'm'}, result: '123'},
        {params: {value: 123456, precisionDigits: 3}, result: '123 k'},
        {params: {value: 123456, precisionDigits: 4}, result: '123.5 k'},
        {params: {value: 123456, precisionDigits: 5}, result: '123.46 k'},
        {params: {value: 123456, precisionDigits: 6}, result: '123.456 k'},
        {params: {value: 123456, precisionDigits: 7}, result: '123.4560 k'},
        {params: {value: 123456, scale: 'k', precisionDigits: 5}, result: '123.46 M'},
        {params: {value: 18245.23, scale: 'k'}, result: '18.2 M'},
        {params: {value: 18245.23, scale: 'µ'}, result: '18.2 m'},
        {params: {value: 1000, scale: 'k'}, result: '1.00 M'},
        {params: {value: 4700.9938, scale: 'p'}, result: '4.70 n'},
        {params: {value: 46920395.334, scale: 'm'}, result: '46.9 k'},
        {params: {value: .01, scale: 'G'}, result: '10.0 M'},
        {params: {value: .00000123, scale: 'G'}, result: '1.23 k'},
        {params: {value: .0001, scale: 'G'}, result: '100 k'},
        {params: {value: 999999}, result: '1.00 M'},
        {params: {value: 999999, minScale: 'k'}, result: '1.00 M'},
        {params: {value: 999999, minScale: 'M'}, result: '1.00 M'},
        {params: {value: 999999, minScale: 'G'}, result: '0.00 G'},
        {params: {value: 999999, minScale: 'T'}, result: '0.00 T'},
        {params: {value: 123, minScale: ''}, result: '123'},
        {params: {value: 1234, minScale: ''}, result: '1.23 k'},
        {params: {value: 1234, minScale: 'M'}, result: '0.00 M'},
        {params: {value: 12345, minScale: 'M'}, result: '0.01 M'},
        {params: {value: 123456, minScale: 'M'}, result: '0.12 M'},
        {params: {value: 987, minScale: 'M'}, result: '0.00 M'},
        {params: {value: 9876, minScale: 'M'}, result: '0.01 M'},
        {params: {value: 98765, minScale: 'M'}, result: '0.10 M'},
        {params: {value: 987654, minScale: 'M'}, result: '0.99 M'},
    )
