import assert from 'node:assert/strict'
import {test} from 'node:test'

import {runTask} from './runTask.js'

const EXECUTING = {messageKey: 'tasks.status.executing', defaultMessage: 'Executing...'}

test('an operation that finishes completes the task, having first said it executes', async () => {
    const {result, reported} = await run({operation: async () => {}})

    assert.deepEqual(
        result,
        {state: 'COMPLETED', statusDescription: {messageKey: 'tasks.status.completed', defaultMessage: 'Completed!'}}
    )
    assert.deepEqual(reported[0], EXECUTING)
})

test('an operation that throws fails the task with what the error says to the user', async () => {
    const error = Object.assign(new Error('boom'), {userMessage: {key: 'tasks.ee.export.asset.encodingTooLarge', message: 'Too large', args: {assetId: 'a'}}})

    const {result} = await run({operation: async () => {
        throw error
    }})

    assert.deepEqual(
        result,
        {state: 'FAILED', statusDescription: {messageKey: 'tasks.ee.export.asset.encodingTooLarge', defaultMessage: 'Too large', messageArgs: {assetId: 'a'}}}
    )
})

test('a task stopped while it runs is canceled, whatever the operation then throws', async () => {
    const abort = new AbortController()

    const {result} = await run({signal: abort.signal, operation: async () => {
        abort.abort()
        throw new Error('interrupted')
    }})

    assert.equal(result.state, 'CANCELED')
})

test('an operation gets the task\'s local processing', async () => {
    const localProcessing = {run: async work => work()}
    let received

    await run({localProcessing, operation: async (_params, context) => received = context.localProcessing})

    assert.equal(received, localProcessing)
})

test('an operation this release does not know fails the task', async () => {
    const {result} = await run({name: 'image.UNKNOWN', operation: async () => {}})

    assert.equal(result.state, 'FAILED')
})

const run = ({operation, signal = new AbortController().signal, name = 'image.GEE', localProcessing = {}}) => {
    const reported = []
    return runTask({
        task: {id: 't-1', operation: name, params: {a: 1}},
        operations: {'image.GEE': operation},
        sepal: {},
        report: description => reported.push(description),
        signal,
        localProcessing
    }).then(result => ({result, reported}))
}
