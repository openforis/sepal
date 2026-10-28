import assert from 'node:assert/strict'
import {beforeEach, describe, mock, test} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

import {callsOf} from '#sepal/testSupport/mock'

const systematicStep$ = mock.fn(request => of({via: 'systematic', request}))
const randomStep$ = mock.fn(request => of({via: 'random', request}))
const deleteAsset$ = mock.fn(() => of(null))

mock.module('#gee/jobs/task/samplingDesign/systematicSteps', {
    exports: {
        systematicStep$
    }
})
mock.module('#gee/jobs/task/samplingDesign/randomSteps', {
    exports: {
        randomStep$
    }
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {deleteAsset$}
    }
})

const {samplingDesignStep$, cleanupTempAssets$} = await import('#gee/jobs/task/samplingDesign/samplingDesignSteps')

const sepalUser = {username: 'alice'}
const TEMP = 'projects/alice/assets/samples_tmp_20261007101010101'

const recipe = arrangementStrategy => ({model: {sampleArrangement: {arrangementStrategy}}})
const step = params => lastValueFrom(samplingDesignStep$(params, {sepalUser}))

beforeEach(() => {
    for (const fn of [systematicStep$, randomStep$, deleteAsset$]) fn.mock.resetCalls()
})

describe('samplingDesignStep$ dispatch', () => {
    test('SYSTEMATIC arrangement runs the systematic step', async () => {
        const result = await step({destination: 'ASSET', assetId: 'a', recipe: recipe('SYSTEMATIC')})

        assert.equal(result.via, 'systematic')
        assert.equal(randomStep$.mock.callCount(), 0)
    })

    test('RANDOM arrangement runs the random step', async () => {
        const result = await step({destination: 'ASSET', assetId: 'a', recipe: recipe('RANDOM')})

        assert.equal(result.via, 'random')
    })

    test('unknown arrangement is a 400', async () => {
        await assert.rejects(step({destination: 'ASSET', recipe: recipe('HEX')}), {statusCode: 400})
    })

    test('unknown destination is a 400', async () => {
        await assert.rejects(step({destination: 'DRIVE', recipe: recipe('RANDOM')}), {statusCode: 400})
    })

    for (const [strategy, kind] of [
        ['SYSTEMATIC', 'random'],
        ['RANDOM', 'systematic']
    ]) {
        test(
            `${strategy} arrangement refuses a ${kind} state with a 400`,
            async () => {
                await assert.rejects(
                    step({destination: 'ASSET', recipe: recipe(strategy), state: {kind, stage: 'final'}}),
                    {statusCode: 400}
                )
            }
        )
    }

    test('a state of the matching kind is passed through', async () => {
        const state = {kind: 'random', stage: 'candidates'}

        await step({destination: 'ASSET', recipe: recipe('RANDOM'), state})

        const [[request, context]] = callsOf(randomStep$)
        assert.equal(request.state, state)
        assert.deepEqual(context, {sepalUser})
    })
})

describe('samplingDesignStep$ names', () => {
    for (const strategy of ['RANDOM', 'SYSTEMATIC']) {
        test(
            `sanitizes the task name and complete asset path for ${strategy}`,
            async () => {
                const result = await step({
                    description: 'Sudan sample design',
                    assetId: 'projects/my-project/assets/Sudan samples/result 1',
                    strategy: 'create',
                    destination: 'ASSET',
                    recipe: recipe(strategy)
                })

                assert.partialDeepStrictEqual(result.request, {
                    description: 'Sudan_sample_design',
                    assetId: 'projects/my-project/assets/Sudan_samples/result_1',
                    strategy: 'create',
                    destination: 'ASSET'
                })
            }
        )
    }

    test('SEPAL sanitizes the file prefix and passes no assetId or strategy', async () => {
        const {request} = await step({
            description: 'Sudan sample design',
            filenamePrefix: 'sample locations 2024',
            workspacePath: 'results',
            fileFormat: 'CSV',
            assetId: 'projects/x/assets/stray',
            strategy: 'replace',
            destination: 'SEPAL',
            recipe: recipe('RANDOM')
        })

        assert.partialDeepStrictEqual(request, {
            description: 'Sudan_sample_design',
            filenamePrefix: 'sample_locations_2024',
            workspacePath: 'results',
            fileFormat: 'CSV',
            destination: 'SEPAL'
        })
        assert.ok(!('assetId' in Object(request)))
        assert.ok(!('strategy' in Object(request)))
    })

    test('SEPAL falls back to the sanitized task name as file prefix', async () => {
        const {request} = await step({
            description: 'Sudan sample design',
            workspacePath: 'results',
            fileFormat: 'CSV',
            destination: 'SEPAL',
            recipe: recipe('SYSTEMATIC')
        })

        assert.partialDeepStrictEqual(request, {
            description: 'Sudan_sample_design',
            filenamePrefix: 'Sudan_sample_design'
        })
    })
})

describe('cleanupTempAssets$', () => {
    test('refuses ids without a temp marker', async () => {
        const result = await lastValueFrom(cleanupTempAssets$({state: {tempAssetIds: ['projects/alice/assets/samples', TEMP]}}))

        assert.equal(deleteAsset$.mock.callCount(), 1)
        assert.deepEqual(callsOf(deleteAsset$), [[TEMP]])
        assert.deepEqual(result, {deleted: [TEMP]})
    })

    test('a missing asset does not fail the cleanup', async () => {
        const other = `${TEMP}_candidates`
        deleteAsset$.mock.mockImplementationOnce(() => throwError(() => new Error('not found')))

        const result = await lastValueFrom(cleanupTempAssets$({state: {tempAssetIds: [TEMP, other]}}))

        assert.deepEqual(result, {deleted: [other]})
    })

    for (const state of [undefined, null, {}, {tempAssetIds: 'x'}]) {
        test(`invalid state ${state} deletes nothing`, async () => {
            assert.deepEqual(await lastValueFrom(cleanupTempAssets$({state})), {deleted: []})
            assert.equal(deleteAsset$.mock.callCount(), 0)
        })
    }
})
