import {Foo, isEqual, resolve, toPathList} from './stateUtils'
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
        // {params: ['root', 'a'], result: ['root', 'a']},
        // {params: null, result: null},
        // {params: undefined, result: null},
        // {params: 123, result: ['123']},
        // {params: {a: 1}, result: {a: 1}},
        // {params: ['a'], result: ['a']},
        // {params: '', result: ['']},
        // {params: 'test', result: ['test']},
        // {params: 'one.two', result: ['one', 'two']},
        // {params: 'one.two.three', result: ['one', 'two', 'three']},
        // {params: ['one.two.three', 'four.five'], result: ['one', 'two', 'three', 'four', 'five']},
        // {params: ['one.two.three', ['four.five', ['six']]], result: ['one', 'two', 'three', 'four', 'five', 'six']},
        // {params: ['a', {b: 1}, 'c.d'], result: ['a', {b: 1}, 'c', 'd']},
        // {params: ['a', {b: 1}, 'c.d', {e: true}], result: ['a', {b: 1}, 'c', 'd', {e: true}]},
        // {params: dotSafe(''), result: ['']},
        // {params: dotSafe('one'), result: ['one']},
        // {params: dotSafe('one.two'), result: ['one.two']},
        // {params: [dotSafe('one.two')], result: ['one.two']},
        // {params: ['a', dotSafe('b.c'), 'd'], result: ['a', 'b.c', 'd']},
        // {params: dotSafe(['one.two', 'three.four.five']), result: ['one.two', 'three.four.five']},
        // {params: dotSafe(['one.two', ['three.four.five', ['six.seven']]]), result: ['one.two', 'three.four.five', 'six.seven']},
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
        {object: {}, path: 'a.b', result: {path: ['a', 'b'], value: undefined}},
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
        {object, path: ['c', {x: 2}, 'k', {w: 1}], result: {path: ['c', 1, 'k', 0], value: {w: 1}}},
        {object, path: ['c', {x: 2}, 'k', {w: 1}, 'x.y.z'], result: {path: ['c', 1, 'k', 0, 'x', 'y', 'z'], value: undefined}},
        {object, path: ['c', {x: 4}], result: {path: ['c', 3], value: {x: 4}}},
        {object, path: ['c', {x: 4}, 'a.b.c.d'], result: {path: ['c', 3, 'a', 'b', 'c', 'd'], value: undefined}},
        {object, path: ['d', {x: {y: 2}}, 'v.k', {z: 3}, 'm'], result: {path: ['d', 1, 'v', 'k', 2, 'm'], value: 'C'}},
        {object: {}, path: ['a', {b: 1}], result: {path: ['a', 0], value: {b: 1}}},
        {object: {a: {}}, path: ['a', {b: 1}], result: {path: ['a', 0], value: {b: 1}}},
    )

it('create', () => {
    const state = {}
    const nextState = new Foo(state, 'a').set(1)
    expect(nextState).toEqual({a: 1})
})

it('assign prop ensuring correct equality', () => {
    const state = {a: {b: 2}, c: 3}
    const nextState = new Foo(state, 'a.b').set(3)
    expect(nextState).toEqual({a: {b: 3}, c: 3})
    expect(state === nextState).toEqual(false)
    expect(state.c === nextState.c).toEqual(true)
})

it('assign array item by index (sparse)', () => {
    const state = {a: ['b', 'c']}
    const nextState = new Foo(state, 'a.3').set('d')
    expect(nextState).toEqual({a: ['b', 'c', undefined, 'd']})
})

it('match by template and assign prop', () => {
    const state = {a: [{b: 1}, 'c']}
    const nextState = new Foo(state, ['a', {b: 1}, 'd']).set(3)
    expect(nextState).toEqual({a: [{b: 1, d: 3}, 'c']})
})

it('match by template and replace', () => {
    const state = {a: [{b: 1}, 'c']}
    const nextState = new Foo(state, ['a', {b: 1}]).set(3)
    expect(nextState).toEqual({a: [3, 'c']})
})

it('create by template', () => {
    const state = {}
    const nextState = new Foo(state, ['x', {a: 1}, 'b']).set(2)
    expect(nextState).toEqual({x: [{a: 1, b: 2}]})
})

it('create by template', () => {
    const state = {}
    const nextState = new Foo(state, ['x', {a: 1}]).set({b: 2})
    expect(nextState).toEqual({x: [{b: 2}]})
})

it('create by template', () => {
    const state = {x: [{a: 1}]}
    const nextState = new Foo(state, ['x', {a: 1}]).set({b: 2})
    expect(nextState).toEqual({x: [{b: 2}]})
})

it('create by template', () => {
    const state = {x: ['y', {a: 1}]}
    const nextState = new Foo(state, ['x', {a: 1}]).set({b: 2})
    expect(nextState).toEqual({x: ['y', {b: 2}]})
})

it('create by template', () => {
    const state = {foo: 'bar'}
    const nextState = new Foo(state, 'a.b').set(1)
    expect(nextState).toEqual({a: {b: 1}, foo: 'bar'})
})

it('create by template', () => {
    const state = {foo: 'bar'}
    const nextState = new Foo(state, 'a.0').set(1)
    expect(nextState).toEqual({a: [1], foo: 'bar'})
})

it('assign non-existing', () => {
    const state = {}
    const nextState = new Foo(state, 'foo').assign({a: 1})
    expect(nextState).toEqual({foo: {a: 1}})
})

it('assign', () => {
    const state = {foo: {bar: 'baz'}}
    const nextState = new Foo(state, 'foo').assign({a: 1})
    expect(nextState).toEqual({foo: {bar: 'baz', a: 1}})
})

it('push non-existing', () => {
    const state = {}
    const nextState = new Foo(state, 'a').push(1)
    expect(nextState).toEqual({a: [1]})
})

it('push', () => {
    const state = {a: [1, 2]}
    const nextState = new Foo(state, 'a').push(3)
    expect(nextState).toEqual({a: [1, 2, 3]})
})

it('push unique non-existing', () => {
    const state = {}
    const nextState = new Foo(state, 'a').pushUnique(1)
    expect(nextState).toEqual({a: [1]})
})

it('push unique does push non-existing value', () => {
    const state = {a: [1, 2]}
    const nextState = new Foo(state, 'a').pushUnique(3)
    expect(nextState).toEqual({a: [1, 2, 3]})
})

it('push unique does push non-existing object by simple key', () => {
    const state = {a: [{id: 1}, {id: 2}]}
    const nextState = new Foo(state, 'a').pushUnique({id: 3}, 'id')
    expect(nextState).toEqual({a: [{id: 1}, {id: 2}, {id: 3}]})
})

it('push unique does push non-existing object by nested key', () => {
    const state = {a: [{foo: {id: 1}}, {foo: {id: 2}}]}
    const nextState = new Foo(state, 'a').pushUnique({foo: {id: 3}}, 'foo.id')
    expect(nextState).toEqual({a: [{foo: {id: 1}}, {foo: {id: 2}}, {foo: {id: 3}}]})
})

it('push unique does not push existing value', () => {
    const state = {a: [1, 2]}
    const nextState = new Foo(state, 'a').pushUnique(2)
    expect(nextState).toEqual({a: [1, 2]})
})

it('push unique does not push existing object by simple key', () => {
    const state = {a: [{id: 1}, {id: 2}]}
    const nextState = new Foo(state, 'a').pushUnique({id: 1}, 'id')
    expect(nextState).toEqual({a: [{id: 1}, {id: 2}]})
})

it('push unique does not push existing object by nested key', () => {
    const state = {a: [{foo: {id: 1}}, {foo: {id: 2}}]}
    const nextState = new Foo(state, 'a').pushUnique({foo: {id: 2}}, 'foo.id')
    expect(nextState).toEqual({a: [{foo: {id: 1}}, {foo: {id: 2}}]})
})

it('delete from object (non-existing path)', () => {
    const state = {}
    const nextState = new Foo(state, 'a').del()
    expect(nextState).toEqual({})
})

it('delete from object nested (non-existing path)', () => {
    const state = {}
    const nextState = new Foo(state, 'a.b').del()
    expect(nextState).toEqual({a: {}})
})

it('delete from object', () => {
    const state = {a: {b: 1, c: 2}}
    const nextState = new Foo(state, 'a.b').del()
    expect(nextState).toEqual({a: {c: 2}})
})

it('delete from array (non-existing array)', () => {
    const state = {}
    const nextState = new Foo(state, 'a.1').del()
    expect(nextState).toEqual({a: []})
})

it('delete from array (non-existing element)', () => {
    const state = {a: [2]}
    const nextState = new Foo(state, 'a.1').del()
    expect(nextState).toEqual({a: [2]})
})

it('delete from array', () => {
    const state = {a: ['b', 'c', 'd']}
    const nextState = new Foo(state, 'a.1').del()
    expect(nextState).toEqual({a: ['b', 'd']})
})

it('delete from array by template', () => {
    const state = {a: [{id: 1}, {id: 2}]}
    const nextState = new Foo(state, ['a', {id: 1}]).del()
    expect(nextState).toEqual({a: [{id: 2}]})
})

it('delete from array by template (non-existing array)', () => {
    const state = {}
    const nextState = new Foo(state, ['a', {id: 1}]).del()
    expect(nextState).toEqual({a: []})
})

it('delete from array by template (non-existing element)', () => {
    const state = {a: [{id: 1}]}
    const nextState = new Foo(state, ['a', {id: 2}]).del()
    expect(nextState).toEqual({a: [{id: 1}]})
})
