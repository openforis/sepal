import assert from 'node:assert/strict'
import {test} from 'node:test'

import {failureStatus} from './failureStatus.js'

test('an error gee answered carries the message the user sees', () => {
    const error = Object.assign(new Error('POST failed'), {
        statusCode: 400,
        body: JSON.stringify({messageKey: 'gee.error.earthEngineException', defaultMessage: 'Earth Engine: no access', messageArgs: {earthEngineMessage: 'no access'}})
    })

    assert.deepEqual(
        failureStatus(error),
        {messageKey: 'gee.error.earthEngineException', defaultMessage: 'Earth Engine: no access', messageArgs: {earthEngineMessage: 'no access'}}
    )
})

test('an Earth Engine export failure names Earth Engine\'s reason', () => {
    const error = Object.assign(new Error('Export failed'), {earthEngineMessage: 'Quota exceeded'})

    assert.deepEqual(
        failureStatus(error),
        {messageKey: 'tasks.status.failed', defaultMessage: 'Failed: Quota exceeded', messageArgs: {error: 'Quota exceeded'}}
    )
})

test('anything else fails with the generic message, never the raw error', () => {
    assert.deepEqual(failureStatus(new Error('TypeError: x is undefined')), {
        messageKey: 'tasks.status.failedGeneric',
        defaultMessage: 'The task failed. Try running it again. If the problem persists, contact the SEPAL team.'
    })
})
