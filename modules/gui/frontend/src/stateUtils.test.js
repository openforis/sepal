import {dotSafe, resolve, selectFrom, toPathList} from './stateUtils'
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

const object = {
    a: 1,
    b: {
        c: 2,
        d: {
            e: 3,
            f: [1, 2, 3]
        }
    },
    c: [{
        x: 1,
        y: 'one'
    }, {
        x: 2,
        y: 'two'
    }, {
        x: 3,
        y: 'three'
    }],
    d: [{
        x: {y: 1},
        v: {
            k: [
                {z: 1, m: 'one'},
                {z: 2, m: 'two'},
                {z: 3, m: 'three'},
                {z: 4, m: 'four'}
            ]
        }
    }, {
        x: {y: 2},
        v: {
            k: [
                {z: 1, m: 'A'},
                {z: 2, m: 'B'},
                {z: 3, m: 'C'},
                {z: 4, m: 'D'}
            ]
        }
    }],
    z: null
}

test('resolve((${object}, ${path})) === ${result}')
    .assert(({object, path, result}) => expect(resolve(object, path)).toEqual(result))
    .where(
        {object: {}, path: '', result: {path: [''], value: undefined}},
        {object: {}, path: 'a', result: {path: ['a'], value: undefined}},
        {object, path: '', result: {path: [''], value: undefined}},
        {object, path: 'a', result: {path: ['a'], value: 1}},
        {object, path: 'u', result: {path: ['u'], value: undefined}},
        {object, path: 'z', result: {path: ['z'], value: null}},
        {object, path: 'z.x', result: {path: ['z', 'x'], value: undefined}},
        {object, path: 'b.c', result: {path: ['b', 'c'], value: 2}},
        {object, path: 'b.d.e', result: {path: ['b', 'd', 'e'], value: 3}},
        {object, path: 'b.d.f', result: {path: ['b', 'd', 'f'], value: [1, 2, 3]}},
        {object, path: 'b.d.f.0', result: {path: ['b', 'd', 'f', 0], value: 1}},
        {object, path: ['b', 'd.f.0'], result: {path: ['b', 'd', 'f', 0], value: 1}},
        {object, path: ['b.d', 'f.0'], result: {path: ['b', 'd', 'f', 0], value: 1}},
        {object, path: ['b.d', 'f', 0], result: {path: ['b', 'd', 'f', 0], value: 1}},
        {object, path: ['b.d', 'f', 1], result: {path: ['b', 'd', 'f', 1], value: 2}},
        {object, path: ['b.d', 'f', 4], result: {path: ['b', 'd', 'f', 4], value: undefined}},
        {object, path: ['b.d', 'f', '0'], result: {path: ['b', 'd', 'f', 0], value: 1}},
        {object, path: ['b.d', 'f', '1'], result: {path: ['b', 'd', 'f', 1], value: 2}},
        {object, path: ['b.d', 'f', '4'], result: {path: ['b', 'd', 'f', 4], value: undefined}},
        {object, path: 'b.d.f.1', result: {path: ['b', 'd', 'f', 1], value: 2}},
        {object, path: 'b.d.f.2', result: {path: ['b', 'd', 'f', 2], value: 3}},
        {object, path: 'b.d.f.3', result: {path: ['b', 'd', 'f', 3], value: undefined}},
        {object, path: ['c', {x: 2}], result: {path: ['c', 1], value: {x: 2, y: 'two'}}},
        {object, path: ['c', {x: 2}, 'y'], result: {path: ['c', 1, 'y'], value: 'two'}},
        {object, path: ['c', {x: 2}, 'y.u'], result: {path: ['c', 1, 'y', 'u'], value: undefined}},
        {object, path: ['c', {x: 2}, 'k'], result: {path: ['c', 1, 'k'], value: undefined}},
        {object, path: ['c', {x: 2}, 'k', {w: 1}], result: {path: undefined, value: undefined}},
        {object, path: ['c', {x: 2}, 'k', {w: 1}, 'x.y.z'], result: {path: undefined, value: undefined}},
        {object, path: ['c', {x: 4}], result: {path: undefined, value: undefined}},
        {object, path: ['c', {x: 4}, 'a.b.c.d'], result: {path: undefined, value: undefined}},
        {object, path: ['d', {x: {y: 2}}, 'v.k', {z: 3}, 'm'], result: {path: ['d', 1, 'v', 'k', 2, 'm'], value: 'C'}}
    )
