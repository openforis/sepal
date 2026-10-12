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

const {inEEContext} = await import('#sepal/ee/eeContext')
const {operationStatus$, operationCancel$, shareAsset$} = await import('#gee/jobs/task/operations')

const USER = {requestId: 'r-1', username: 'alice', origin: 'task', auth: {type: 'user'}, projectId: 'p', endpoint: 'https://ee'}
const SERVICE_ACCOUNT = {...USER, auth: {type: 'serviceAccount'}}

const asUser = (operation$, context = USER) => firstValueFrom(inEEContext(context, operation$))

beforeEach(() => {
    calls.length = 0
})

test('the status of an operation is its Earth Engine state and error message', async () => {
    expect(await asUser(operationStatus$({eeTaskId: 'T1'}))).toEqual({state: 'FAILED', errorMessage: 'Quota exceeded'})
})

test('cancelling an operation answers once Earth Engine accepted it', async () => {
    expect(await asUser(operationCancel$({eeTaskId: 'T1'}))).toEqual({})
    expect(calls).toEqual([{operation: 'cancel', eeTaskId: 'T1', maxRetries: 3}])
})

test('sharing an asset grants everyone read access', async () => {
    expect(await asUser(shareAsset$({assetId: 'projects/p/assets/out'}))).toEqual({})
    expect(calls).toEqual([{
        operation: 'share',
        assetId: 'projects/p/assets/out',
        policy: {bindings: [{role: 'roles/viewer', members: ['allUsers']}]}
    }])
})

test('sharing an asset is refused for a user without a Google account, and nothing is shared', async () => {
    await expect(asUser(shareAsset$({assetId: 'projects/p/assets/out'}), SERVICE_ACCOUNT)).rejects.toThrow(/service account/)
    expect(calls).toEqual([])
})
