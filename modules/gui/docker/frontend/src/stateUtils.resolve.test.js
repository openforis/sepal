import {resolve} from './stateUtils'
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
        {object: {}, path: '', result: undefined},
        {object: {}, path: 'a', result: undefined},
        {object: {}, path: 'a.b', result: undefined},
        {object, path: '', result: undefined},
        {object, path: 'a', result: 1},
        {object, path: 'u', result: undefined},
        {object, path: 'z', result: null},
        {object, path: 'z.x', result: undefined},
        {object, path: 'b.c', result: 2},
        {object, path: 'b.d.e', result: 3},
        {object, path: 'b.d.f', result: [1, 2, 3]},
        {object, path: 'b.d.f.0', result: 1},
        {object, path: ['b', 'd.f.0'], result: 1},
        {object, path: ['b.d', 'f.0'], result: 1},
        {object, path: ['b.d', 'f', 0], result: 1},
        {object, path: ['b.d', 'f', 1], result: 2},
        {object, path: ['b.d', 'f', 4], result: undefined},
        {object, path: ['b.d', 'f', '0'], result: 1},
        {object, path: ['b.d', 'f', '1'], result: 2},
        {object, path: ['b.d', 'f', '4'], result: undefined},
        {object, path: 'b.d.f.1', result: 2},
        {object, path: 'b.d.f.2', result: 3},
        {object, path: 'b.d.f.3', result: undefined},
        {object, path: ['c', {x: 2}], result: {x: 2, y: 'two'}},
        {object, path: ['c', {x: 2}, 'y'], result: 'two'},
        {object, path: ['c', {x: 2}, 'y.u'], result: undefined},
        {object, path: ['c', {x: 2}, 'k'], result: undefined},
        {object, path: ['c', {x: 2}, 'k', {w: 1}], result: undefined},
        {object, path: ['c', {x: 2}, 'k', {w: 1}, 'x.y.z'], result: undefined},
        {object, path: ['c', {x: 4}], result: undefined},
        {object, path: ['c', {x: 4}, 'a.b.c.d'], result: undefined},
        {object, path: ['d', {x: {y: 2}}, 'v.k', {z: 3}, 'm'], result: 'C'},
        {object: {}, path: ['a', {b: 1}], result: undefined},
    )

// test('resolve((${object}, ${path})) === ${result}')
//     .assert(({object, path, result}) => expect(resolve(object, path)).toEqual(result))
//     .where(
//         {object: {}, path: '', result: {path: [''], value: undefined}},
//         {object: {}, path: 'a', result: {path: ['a'], value: undefined}},
//         {object: {}, path: 'a.b', result: {path: ['a', 'b'], value: undefined}},
//         {object, path: '', result: {path: [''], value: undefined}},
//         {object, path: 'a', result: {path: ['a'], value: 1}},
//         {object, path: 'u', result: {path: ['u'], value: undefined}},
//         {object, path: 'z', result: {path: ['z'], value: null}},
//         {object, path: 'z.x', result: {path: ['z', 'x'], value: undefined}},
//         {object, path: 'b.c', result: {path: ['b', 'c'], value: 2}},
//         {object, path: 'b.d.e', result: {path: ['b', 'd', 'e'], value: 3}},
//         {object, path: 'b.d.f', result: {path: ['b', 'd', 'f'], value: [1, 2, 3]}},
//         {object, path: 'b.d.f.0', result: {path: ['b', 'd', 'f', 0], value: 1}},
//         {object, path: ['b', 'd.f.0'], result: {path: ['b', 'd', 'f', 0], value: 1}},
//         {object, path: ['b.d', 'f.0'], result: {path: ['b', 'd', 'f', 0], value: 1}},
//         {object, path: ['b.d', 'f', 0], result: {path: ['b', 'd', 'f', 0], value: 1}},
//         {object, path: ['b.d', 'f', 1], result: {path: ['b', 'd', 'f', 1], value: 2}},
//         {object, path: ['b.d', 'f', 4], result: {path: ['b', 'd', 'f', 4], value: undefined}},
//         {object, path: ['b.d', 'f', '0'], result: {path: ['b', 'd', 'f', 0], value: 1}},
//         {object, path: ['b.d', 'f', '1'], result: {path: ['b', 'd', 'f', 1], value: 2}},
//         {object, path: ['b.d', 'f', '4'], result: {path: ['b', 'd', 'f', 4], value: undefined}},
//         {object, path: 'b.d.f.1', result: {path: ['b', 'd', 'f', 1], value: 2}},
//         {object, path: 'b.d.f.2', result: {path: ['b', 'd', 'f', 2], value: 3}},
//         {object, path: 'b.d.f.3', result: {path: ['b', 'd', 'f', 3], value: undefined}},
//         {object, path: ['c', {x: 2}], result: {path: ['c', 1], value: {x: 2, y: 'two'}}},
//         {object, path: ['c', {x: 2}, 'y'], result: {path: ['c', 1, 'y'], value: 'two'}},
//         {object, path: ['c', {x: 2}, 'y.u'], result: {path: ['c', 1, 'y', 'u'], value: undefined}},
//         {object, path: ['c', {x: 2}, 'k'], result: {path: ['c', 1, 'k'], value: undefined}},
//         {object, path: ['c', {x: 2}, 'k', {w: 1}], result: {path: ['c', 1, 'k', 0], value: undefined}},
//         {object, path: ['c', {x: 2}, 'k', {w: 1}, 'x.y.z'], result: {path: ['c', 1, 'k', 0, 'x', 'y', 'z'], value: undefined}},
//         {object, path: ['c', {x: 4}], result: {path: ['c', 3], value: undefined}},
//         {object, path: ['c', {x: 4}, 'a.b.c.d'], result: {path: ['c', 3, 'a', 'b', 'c', 'd'], value: undefined}},
//         {object, path: ['d', {x: {y: 2}}, 'v.k', {z: 3}, 'm'], result: {path: ['d', 1, 'v', 'k', 2, 'm'], value: 'C'}},
//         {object: {}, path: ['a', {b: 1}], result: {path: ['a', 0], value: undefined}},
//     )
