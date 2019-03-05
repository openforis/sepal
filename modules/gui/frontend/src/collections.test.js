import {dotSafe, selectFrom, toPathList} from './collections'
import _ from 'lodash'

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
    
test('selectFrom((${object}, ${path})) === ${result}')
    .assert(({object, path, result}) => expect(selectFrom(object, path)).toEqual(result))
    .where(
        {object: {}, path: '', result: undefined},
        {object: {}, path: 'a', result: undefined},
        {object: {a: 1}, path: '', result: undefined},
        {object: {a: 1}, path: 'a', result: 1},
        {object: {a: 1}, path: 'b', result: undefined},
        {object: {a: null}, path: 'a.b', result: undefined},
        {object: {a: {b: 2}}, path: 'a.b', result: 2},
        {object: {a: {b: {c: 3}}}, path: 'a.b.c', result: 3},
        {object: {a: {b: {c: [1, 2, 3]}}}, path: 'a.b.c', result: [1, 2, 3]},
        {object: {a: {b: {c: [1, 2, 3]}}}, path: 'a.b.c.0', result: 1},
        {object: {a: {b: {c: [1, 2, 3]}}}, path: 'a.b.c.1', result: 2},
        {object: {a: {b: {c: [1, 2, 3]}}}, path: 'a.b.c.2', result: 3},
        {object: {a: {b: {c: [1, 2, 3]}}}, path: 'a.b.c.3', result: undefined},
        {object: {a: {b: {c: [1, 2, 3]}}}, path: ['a', 'b.c', 2], result: 3},
        {object: {a: {b: {c: [{x: 1}, {y: 2}, {z: 3}]}}}, path: ['a', 'b.c', 1], result: {y: 2}},
        {object: [{x: 1, xx: 10}, {y: 2, yy: 20}, {z: 3, zz: 30}], path: [{x: 1}], result: {x: 1, xx: 10}},
        {object: {a: {b: {c: [{x: 1, v: 10}, {y: 2, v: 20}, {z: 3, v: 30}]}}}, path: ['a', 'b.c', {x: 1}], result: {x: 1, v: 10}},
        {object: {a: [{x: 1, v: 10}, {y: 2, v: 20}, {z: 3, v: 30}]}, path: ['a', {y: 2}], result: {y: 2, v: 20}},
        {object: {a: [{x: 1, v: 10}, {y: 2, v: 20}]}, path: ['a', {y: 2}, 'v'], result: 20},
        {object: {a: [{x: 1, v: {k: 10}}, {y: 2, v: {k: 20}}]}, path: ['a', {y: 2}, 'v'], result: {k: 20}},
        {object: {
            a: [{
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
            }, {
                x: {y: 3},
                v: {
                    k: [
                        {z: 1, m: 'alpha'},
                        {z: 2, m: 'beta'},
                        {z: 3, m: 'gamma'},
                        {z: 4, m: 'delta'}
                    ]
                }
            }]
        }, path: ['a', {x: {y: 2}}, 'v.k', {z: 3}, 'm'], result: 'C'}
    )
    
