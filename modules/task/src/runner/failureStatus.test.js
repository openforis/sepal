import {failureStatus} from './failureStatus.js'

test('an error gee answered carries the message the user sees', () => {
    const error = Object.assign(new Error('POST failed'), {
        statusCode: 400,
        body: JSON.stringify({messageKey: 'gee.error.earthEngineException', defaultMessage: 'Earth Engine: no access', messageArgs: {earthEngineMessage: 'no access'}})
    })

    expect(failureStatus(error)).toEqual({messageKey: 'gee.error.earthEngineException', defaultMessage: 'Earth Engine: no access', messageArgs: {earthEngineMessage: 'no access'}})
})

test('an Earth Engine export failure names Earth Engine\'s reason', () => {
    const error = Object.assign(new Error('Export failed'), {earthEngineMessage: 'Quota exceeded'})

    expect(failureStatus(error)).toEqual({messageKey: 'tasks.status.failed', defaultMessage: 'Failed: Quota exceeded', messageArgs: {error: 'Quota exceeded'}})
})

test('anything else fails with the generic message, never the raw error', () => {
    expect(failureStatus(new Error('TypeError: x is undefined'))).toEqual({
        messageKey: 'tasks.status.failedGeneric',
        defaultMessage: 'The task failed. Try running it again. If the problem persists, contact the SEPAL team.'
    })
})
