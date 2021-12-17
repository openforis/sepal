import {Mutator} from './stateUtils'
import _ from 'lodash'

/* eslint-disable no-undef */

it('create', () => {
    const state = {}
    const nextState = new Mutator(state, 'a').set(1)
    expect(nextState).toEqual({a: 1})
})

it('set prop ensuring correct equality', () => {
    const state = {a: {b: 2}, c: 3}
    const nextState = new Mutator(state, 'a.b').set(3)
    expect(nextState).toEqual({a: {b: 3}, c: 3})
    expect(state === nextState).toEqual(false)
    expect(state.c === nextState.c).toEqual(true)
})

it('set array item by index (sparse)', () => {
    const state = {a: ['b', 'c']}
    const nextState = new Mutator(state, 'a.3').set('d')
    expect(nextState).toEqual({a: ['b', 'c', undefined, 'd']})
})

it('match by template and assign prop', () => {
    const state = {a: [{b: 1}, 'c']}
    const nextState = new Mutator(state, ['a', {b: 1}, 'd']).set(3)
    expect(nextState).toEqual({a: [{b: 1, d: 3}, 'c']})
})

it('match by template and replace', () => {
    const state = {a: [{b: 1}, 'c']}
    const nextState = new Mutator(state, ['a', {b: 1}]).set(3)
    expect(nextState).toEqual({a: [3, 'c']})
})

it('create by template', () => {
    const state = {}
    const nextState = new Mutator(state, ['x', {a: 1}, 'b']).set(2)
    expect(nextState).toEqual({x: [{a: 1, b: 2}]})
})

it('create by template', () => {
    const state = {}
    const nextState = new Mutator(state, ['x', {a: 1}]).set({b: 2})
    expect(nextState).toEqual({x: [{b: 2}]})
})

it('create by template', () => {
    const state = {x: [{a: 1}]}
    const nextState = new Mutator(state, ['x', {a: 1}]).set({b: 2})
    expect(nextState).toEqual({x: [{b: 2}]})
})

it('create by template', () => {
    const state = {x: ['y', {a: 1}]}
    const nextState = new Mutator(state, ['x', {a: 1}]).set({b: 2})
    expect(nextState).toEqual({x: ['y', {b: 2}]})
})

it('create by template', () => {
    const state = {foo: 'bar'}
    const nextState = new Mutator(state, 'a.b').set(1)
    expect(nextState).toEqual({a: {b: 1}, foo: 'bar'})
})

it('create by template', () => {
    const state = {foo: 'bar'}
    const nextState = new Mutator(state, 'a.0').set(1)
    expect(nextState).toEqual({a: [1], foo: 'bar'})
})

it('assign non-existing', () => {
    const state = {}
    const nextState = new Mutator(state, 'foo').assign({a: 1})
    expect(nextState).toEqual({foo: {a: 1}})
})

it('assign', () => {
    const state = {foo: {bar: 'baz'}}
    const nextState = new Mutator(state, 'foo').assign({a: 1})
    expect(nextState).toEqual({foo: {bar: 'baz', a: 1}})
    expect(state.foo === nextState.foo).toEqual(false)
})

it('merge non-existing', () => {
    const state = {}
    const nextState = new Mutator(state, 'foo').merge({a: 1})
    expect(nextState).toEqual({foo: {a: 1}})
})

it('merge', () => {
    const state = {a: {b: {c: 1}}}
    const nextState = new Mutator(state, 'a').merge({b: {d: 2}})
    expect(nextState).toEqual({a: {b: {c: 1, d: 2}}})
    expect(state.a === nextState.a).toEqual(false)
    expect(state.a.b === nextState.a.b).toEqual(false)
})

it('push non-existing', () => {
    const state = {}
    const nextState = new Mutator(state, 'a').push(1)
    expect(nextState).toEqual({a: [1]})
})

it('push', () => {
    const state = {a: [1, 2]}
    const nextState = new Mutator(state, 'a').push(3)
    expect(nextState).toEqual({a: [1, 2, 3]})
    expect(nextState.a === state.a).toEqual(false)
})

it('push unique non-existing', () => {
    const state = {}
    const nextState = new Mutator(state, 'a').pushUnique(1)
    expect(nextState).toEqual({a: [1]})
})

it('push unique does push non-existing value', () => {
    const state = {a: [1, 2]}
    const nextState = new Mutator(state, 'a').pushUnique(3)
    expect(nextState).toEqual({a: [1, 2, 3]})
    expect(nextState.a === state.a).toEqual(false)
})

it('push unique does push non-existing object by simple key', () => {
    const state = {a: [{id: 1}, {id: 2}]}
    const nextState = new Mutator(state, 'a').pushUnique({id: 3}, 'id')
    expect(nextState).toEqual({a: [{id: 1}, {id: 2}, {id: 3}]})
})

it('push unique does push non-existing object by nested key', () => {
    const state = {a: [{foo: {id: 1}}, {foo: {id: 2}}]}
    const nextState = new Mutator(state, 'a').pushUnique({foo: {id: 3}}, 'foo.id')
    expect(nextState).toEqual({a: [{foo: {id: 1}}, {foo: {id: 2}}, {foo: {id: 3}}]})
})

it('push unique does not push existing value', () => {
    const state = {a: [1, 2]}
    const nextState = new Mutator(state, 'a').pushUnique(2)
    expect(nextState).toEqual({a: [1, 2]})
})

it('push unique does not push existing object by simple key', () => {
    const state = {a: [{id: 1}, {id: 2}]}
    const nextState = new Mutator(state, 'a').pushUnique({id: 1}, 'id')
    expect(nextState).toEqual({a: [{id: 1}, {id: 2}]})
})

it('push unique does not push existing object by nested key', () => {
    const state = {a: [{foo: {id: 1}}, {foo: {id: 2}}]}
    const nextState = new Mutator(state, 'a').pushUnique({foo: {id: 2}}, 'foo.id')
    expect(nextState).toEqual({a: [{foo: {id: 1}}, {foo: {id: 2}}]})
})

it('delete from object (non-existing path)', () => {
    const state = {}
    const nextState = new Mutator(state, 'a').del()
    expect(nextState).toEqual({})
})

it('delete from object nested (non-existing path)', () => {
    const state = {}
    const nextState = new Mutator(state, 'a.b').del()
    expect(nextState).toEqual({a: {}})
})

it('delete from object', () => {
    const state = {a: {b: 1, c: 2}}
    const nextState = new Mutator(state, 'a.b').del()
    expect(nextState).toEqual({a: {c: 2}})
    expect(state.a === nextState.a).toEqual(false)
})

it('delete from array (non-existing array)', () => {
    const state = {}
    const nextState = new Mutator(state, 'a.1').del()
    expect(nextState).toEqual({a: []})
})

it('delete from array (non-existing element)', () => {
    const state = {a: [2]}
    const nextState = new Mutator(state, 'a.1').del()
    expect(nextState).toEqual({a: [2]})
})

it('delete from array', () => {
    const state = {a: ['b', 'c', 'd']}
    const nextState = new Mutator(state, 'a.1').del()
    expect(nextState).toEqual({a: ['b', 'd']})
    expect(state.a === nextState.a).toEqual(false)
})

it('delete from array by template', () => {
    const state = {a: [{id: 1}, {id: 2}]}
    const nextState = new Mutator(state, ['a', {id: 1}]).del()
    expect(nextState).toEqual({a: [{id: 2}]})
})

it('delete from array by template (non-existing array)', () => {
    const state = {}
    const nextState = new Mutator(state, ['a', {id: 1}]).del()
    expect(nextState).toEqual({a: []})
})

it('delete from array by template (non-existing element)', () => {
    const state = {a: [{id: 1}]}
    const nextState = new Mutator(state, ['a', {id: 2}]).del()
    expect(nextState).toEqual({a: [{id: 1}]})
})
