import {isEqualIgnoreFunctions, stripFunctions} from './collections'
import _ from 'lodash'

/* eslint-disable no-undef */

const test = name => {
    const nameTemplate = _.template(name)
    return ({
        assert: assertion => ({
            where: (...data) =>
                data.forEach(data =>
                    it(nameTemplate(data), () => assertion(data))
                )
        })
    })
}

test('stripFunctions(${params}) === ${result}')
    .assert(({params, result}) => expect(stripFunctions(params)).toEqual(result))
    .where(
        {params: {a: 1}, result: {a: 1}},
        {params: {a: 1, b: () => 2}, result: {a: 1, b: null}},
        {params: {a: 1, b: () => 2, c: {d: 2}}, result: {a: 1, b: null, c: {d: 2}}},
        {params: [() => 1], result: [null]},
        {params: [1, 2, () => 3], result: [1, 2, null]},
        {params: [1, () => 2, 3], result: [1, null, 3]},
        {params: {a: [() => 1]}, result: {a: [null]}},
    )

test('isEqualIgnoreFunctions(${params.o1}, ${params.o2}) === ${result}')
    .assert(({params, result}) => expect(isEqualIgnoreFunctions(params.o1, params.o2)).toEqual(result))
    .where(
        {params: {o1: {}, o2: {}}, result: true},
        {params: {o1: {a: 1}, o2: {a: 1}}, result: true},
        {params: {o1: {a: 1, b: () => 1}, o2: {a: 1, b: () => 1}}, result: true},
        {params: {o1: {a: 1, b: () => 1}, o2: {a: 1, b: null}}, result: true},
        {params: {o1: {a: [() => 1]}, o2: {a: [null]}}, result: true},
    )
