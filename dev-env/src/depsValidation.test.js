import assert from 'node:assert/strict'
import {test} from 'node:test'

import {describeCycle, findDependencyCycles} from './depsValidation.js'

test('returns no cycles for an acyclic dependency graph', () => {
    const deps = {
        a: {run: ['b', 'c'], build: {}},
        b: {run: ['c'], build: {}},
        c: {run: [], build: {}}
    }
    assert.deepEqual(findDependencyCycles(deps), [])
})

test('detects a direct run-dependency cycle', () => {
    const deps = {
        a: {run: ['b']},
        b: {run: ['a']}
    }
    assert.deepEqual(findDependencyCycles(deps), [
        {graph: 'run', path: ['a', 'b', 'a']}
    ])
})

test('detects a self run-dependency cycle', () => {
    const deps = {
        a: {run: ['a']}
    }
    assert.deepEqual(findDependencyCycles(deps), [
        {graph: 'run', path: ['a', 'a']}
    ])
})

test('detects a longer indirect run-dependency cycle', () => {
    const deps = {
        a: {run: ['b']},
        b: {run: ['c']},
        c: {run: ['a']}
    }
    assert.deepEqual(findDependencyCycles(deps), [
        {graph: 'run', path: ['a', 'b', 'c', 'a']}
    ])
})

test('detects a build-dependency cycle', () => {
    const deps = {
        a: {build: {b: 'build'}},
        b: {build: {a: 'run'}}
    }
    assert.deepEqual(findDependencyCycles(deps), [
        {graph: 'build', path: ['a', 'b', 'a']}
    ])
})

test('reports each cycle only once regardless of entry point', () => {
    const deps = {
        a: {run: ['b']},
        b: {run: ['a']},
        c: {run: ['a']}
    }
    assert.equal(findDependencyCycles(deps).length, 1)
})

test('ignores dependencies on modules without a deps entry', () => {
    const deps = {
        a: {run: ['unknown']}
    }
    assert.deepEqual(findDependencyCycles(deps), [])
})

test('handles modules with run set to false', () => {
    const deps = {
        a: {run: false, build: {}},
        b: {run: ['a']}
    }
    assert.deepEqual(findDependencyCycles(deps), [])
})

test('describes a cycle as a readable message', () => {
    assert.equal(
        describeCycle({graph: 'run', path: ['budget', 'worker', 'budget']}),
        'Circular run dependency: budget -> worker -> budget'
    )
})

test('reports independent run and build cycles separately', () => {
    const deps = {
        a: {run: ['b'], build: {}},
        b: {run: ['a'], build: {}},
        c: {build: {d: 'build'}},
        d: {build: {c: 'build'}}
    }
    const cycles = findDependencyCycles(deps)
    assert.equal(cycles.length, 2)
    assert.deepEqual(cycles.map(({graph}) => graph).sort(), ['build', 'run'])
})
