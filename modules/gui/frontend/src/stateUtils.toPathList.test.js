import {dotSafe, toPathList} from './stateUtils'
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

test('toPathList(${params}) === ${result}')
    .assert(({params, result}) => expect(toPathList(params)).toEqual(result))
    .where(
        {params: ['root', 'a'], result: ['root', 'a']},
        {params: null, result: null},
        {params: undefined, result: null},
        {params: 123, result: ['123']},
        {params: {a: 1}, result: {a: 1}},
        {params: ['a'], result: ['a']},
        {params: '', result: ['']},
        {params: 'test', result: ['test']},
        {params: 'one.two', result: ['one', 'two']},
        {params: 'one.two.three', result: ['one', 'two', 'three']},
        {params: ['one.two.three', 'four.five'], result: ['one', 'two', 'three', 'four', 'five']},
        {params: ['one.two.three', ['four.five', ['six']]], result: ['one', 'two', 'three', 'four', 'five', 'six']},
        {params: ['a', {b: 1}, 'c.d'], result: ['a', {b: 1}, 'c', 'd']},
        {params: ['a', {b: 1}, 'c.d', {e: true}], result: ['a', {b: 1}, 'c', 'd', {e: true}]},
        {params: dotSafe(''), result: ['']},
        {params: dotSafe('one'), result: ['one']},
        {params: dotSafe('one.two'), result: ['one.two']},
        {params: [dotSafe('one.two')], result: ['one.two']},
        {params: ['a', dotSafe('b.c'), 'd'], result: ['a', 'b.c', 'd']},
        {params: dotSafe(['one.two', 'three.four.five']), result: ['one.two', 'three.four.five']},
        {params: dotSafe(['one.two', ['three.four.five', ['six.seven']]]), result: ['one.two', 'three.four.five', 'six.seven']},
    )
