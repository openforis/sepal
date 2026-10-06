import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

// The operation endpoints a task container polls and cancels through. The Earth Engine transport is substituted;
// what each endpoint asks of it and answers is the contract.

const calls = []

jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {
        getTaskStatus$: (eeTaskId, _description, maxRetries) => {
            calls.push({operation: 'status', eeTaskId, maxRetries})
            return of({state: 'FAILED', error_message: 'Quota exceeded'})
        },
        cancelTask$: (eeTaskId, _description, maxRetries) => {
            calls.push({operation: 'cancel', eeTaskId, maxRetries})
            return of(undefined)
        },
        setAssetIamPolicy$: (assetId, policy) => {
            calls.push({operation: 'share', assetId, policy})
            return of(undefined)
        }
    }
}))

const {operationStatus$, operationCancel$, shareAsset$} = await import('#gee/jobs/task/operations')

beforeEach(() => {
    calls.length = 0
})

test('the status of an operation is its Earth Engine state and error message', async () => {
    expect(await firstValueFrom(operationStatus$({eeTaskId: 'T1'}))).toEqual({state: 'FAILED', errorMessage: 'Quota exceeded'})
})

test('cancelling an operation answers once Earth Engine accepted it', async () => {
    expect(await firstValueFrom(operationCancel$({eeTaskId: 'T1'}))).toEqual({})
    expect(calls).toEqual([{operation: 'cancel', eeTaskId: 'T1', maxRetries: 3}])
})

test('sharing an asset grants everyone read access', async () => {
    expect(await firstValueFrom(shareAsset$({assetId: 'projects/p/assets/out'}))).toEqual({})
    expect(calls).toEqual([{
        operation: 'share',
        assetId: 'projects/p/assets/out',
        policy: {bindings: [{role: 'roles/viewer', members: ['allUsers']}]}
    }])
})
