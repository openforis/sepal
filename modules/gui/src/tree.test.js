import {NODE_KEY, Tree} from './tree'
import _ from 'lodash'

/* eslint-disable no-undef */

it('create root', () => {
    const tree = Tree.createNode()
    expect(tree).toEqual({
        [NODE_KEY]: {path: []}
    })
})

it('create 1st level node on empty root', () => {
    const tree = Tree.createNode()
    Tree.createPath(tree, ['foo'])
    expect(tree).toEqual({
        [NODE_KEY]: {path: []},
        foo: {
            [NODE_KEY]: {path: ['foo']}
        }
    })
})

it('create 2nd level node on empty root', () => {
    const tree = Tree.createNode()
    Tree.createPath(tree, ['foo', 'bar'])
    expect(tree).toEqual({
        [NODE_KEY]: {path: []},
        foo: {
            [NODE_KEY]: {path: ['foo']},
            bar: {
                [NODE_KEY]: {path: ['foo', 'bar']}
            }
        }
    })
})

it('create 2nd level node on esisting 1st level', () => {
    const tree = Tree.createNode()
    Tree.createPath(tree, ['foo'])
    Tree.createPath(tree, ['foo', 'bar'])
    expect(tree).toEqual({
        [NODE_KEY]: {path: []},
        foo: {
            [NODE_KEY]: {path: ['foo']},
            bar: {
                [NODE_KEY]: {path: ['foo', 'bar']}
            }
        }
    })
})

it('set root value', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, [], 'bar')
    expect(tree).toEqual({
        [NODE_KEY]: {path: [], value: 'bar'}
    })
})

it('set 1st level value', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, ['foo'], 'v')
    expect(tree).toEqual({
        [NODE_KEY]: {path: []},
        foo: {
            [NODE_KEY]: {path: ['foo'], value: 'v'}
        }
    })
})

it('set 2nd level value', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, ['foo', 'bar'], 'v')
    expect(tree).toEqual({
        [NODE_KEY]: {path: []},
        foo: {
            [NODE_KEY]: {path: ['foo']},
            bar: {
                [NODE_KEY]: {path: ['foo', 'bar'], value: 'v'}
            }
        }
    })
})

it('get 1st level value', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, ['foo'], 'v')
    const v = Tree.getValue(tree, ['foo'])
    expect(v).toEqual('v')
})

it('get 2nd level value', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, ['foo', 'bar'], 'v')
    const v = Tree.getValue(tree, ['foo', 'bar'])
    expect(v).toEqual('v')
})

it('get 2nd level value for missing 1st level node', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, ['foo', 'bar'], 'v')
    const v = Tree.getValue(tree, ['baz'])
    expect(v).toEqual(undefined)
})

it('get 2nd level value for missing 2nd level node', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, ['foo', 'bar'], 'v')
    const v = Tree.getValue(tree, ['foo', 'baz'])
    expect(v).toEqual(undefined)
})

it('flatten root defined', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, [], 'v')
    const flattenedTree = Tree.flatten(tree)
    expect(flattenedTree).toEqual([
        {path: [], value: 'v', depth: 0}
    ])
})

it('flatten 1st level defined', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, ['foo'], 'v')
    const flattenedTree = Tree.flatten(tree)
    expect(flattenedTree).toEqual([
        {path: [], value: undefined, depth: 0},
        {path: ['foo'], value: 'v', depth: 1}
    ])
})

it('flatten 2nd level defined', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, ['foo', 'bar'], 'v')
    const flattenedTree = Tree.flatten(tree)
    expect(flattenedTree).toEqual([
        {path: [], value: undefined, depth: 0},
        {path: ['foo'], value: undefined, depth: 1},
        {path: ['foo', 'bar'], value: 'v', depth: 2}
    ])
})

it('flatten all levels defined', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, [], 'v0')
    Tree.setValue(tree, ['foo'], 'v1')
    Tree.setValue(tree, ['foo', 'bar'], 'v2')
    const flattenedTree = Tree.flatten(tree)
    expect(flattenedTree).toEqual([
        {path: [], value: 'v0', depth: 0},
        {path: ['foo'], value: 'v1', depth: 1},
        {path: ['foo', 'bar'], value: 'v2', depth: 2}
    ])
})

it('filter non-leaf', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, [], 'bad')
    Tree.setValue(tree, ['foo'], 'good')
    Tree.setValue(tree, ['foo', 'bar'], 'bad')
    const filteredTree = Tree.filter(tree, ({value}) => value === 'good')
    expect(filteredTree).toEqual({
        [NODE_KEY]: {path: [], value: 'bad'},
        foo: {
            [NODE_KEY]: {path: ['foo'], value: 'good'}
        }
    })
})

it('filter leaf', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, [], 'bad')
    Tree.setValue(tree, ['foo'], 'bad')
    Tree.setValue(tree, ['foo', 'bar'], 'good')
    const filteredTree = Tree.filter(tree, ({value}) => value === 'good')
    expect(filteredTree).toEqual({
        [NODE_KEY]: {path: [], value: 'bad'},
        foo: {
            [NODE_KEY]: {path: ['foo'], value: 'bad'},
            bar: {
                [NODE_KEY]: {path: ['foo', 'bar'], value: 'good'}
            }
        }
    })
})

it('filter leaf + non-leaf', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, [], 'bad')
    Tree.setValue(tree, ['foo'], 'good')
    Tree.setValue(tree, ['foo', 'bar'], 'bad')
    Tree.setValue(tree, ['foo', 'baz'], 'good')
    const filteredTree = Tree.filter(tree, ({value}) => value === 'good')
    expect(filteredTree).toEqual({
        [NODE_KEY]: {path: [], value: 'bad'},
        foo: {
            [NODE_KEY]: {path: ['foo'], value: 'good'},
            baz: {
                [NODE_KEY]: {path: ['foo', 'baz'], value: 'good'}
            }
        }
    })
})

it('filter with depth limited to 0', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, [], 'good')
    Tree.setValue(tree, ['foo'], 'good')
    Tree.setValue(tree, ['foo', 'bar'], 'good')
    const filteredTree = Tree.filter(tree, ({value}) => value === 'good', 0)
    expect(filteredTree).toEqual({
        [NODE_KEY]: {path: [], value: 'good'}
    })
})

it('filter with depth limited to 1', () => {
    const tree = Tree.createNode()
    Tree.setValue(tree, [], 'bad')
    Tree.setValue(tree, ['foo'], 'good')
    Tree.setValue(tree, ['foo', 'bar'], 'good')
    const filteredTree = Tree.filter(tree, ({value}) => value === 'good', 1)
    expect(filteredTree).toEqual({
        [NODE_KEY]: {path: [], value: 'bad'},
        foo: {
            [NODE_KEY]: {path: ['foo'], value: 'good'}
        }
    })
})
