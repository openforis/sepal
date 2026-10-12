import {jest} from '@jest/globals'
import {lastValueFrom, of, throwError} from 'rxjs'

const systematicStep$ = jest.fn(request => of({via: 'systematic', request}))
const randomStep$ = jest.fn(request => of({via: 'random', request}))
const deleteAsset$ = jest.fn(() => of(null))

jest.unstable_mockModule('#gee/jobs/task/samplingDesign/systematicSteps', () => ({systematicStep$}))
jest.unstable_mockModule('#gee/jobs/task/samplingDesign/randomSteps', () => ({randomStep$}))
jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {deleteAsset$}}))

const {samplingDesignStep$, cleanupTempAssets$} = await import('#gee/jobs/task/samplingDesign/samplingDesignSteps')

const sepalUser = {username: 'alice'}
const TEMP = 'projects/alice/assets/samples_tmp_20261007101010101'

const recipe = arrangementStrategy => ({model: {sampleArrangement: {arrangementStrategy}}})
const step = params => lastValueFrom(samplingDesignStep$(params, {sepalUser}))

beforeEach(() => jest.clearAllMocks())

describe('samplingDesignStep$ dispatch', () => {
    test('SYSTEMATIC arrangement runs the systematic step', async () => {
        const result = await step({destination: 'ASSET', assetId: 'a', recipe: recipe('SYSTEMATIC')})

        expect(result.via).toBe('systematic')
        expect(randomStep$).not.toHaveBeenCalled()
    })

    test('RANDOM arrangement runs the random step', async () => {
        const result = await step({destination: 'ASSET', assetId: 'a', recipe: recipe('RANDOM')})

        expect(result.via).toBe('random')
    })

    test('unknown arrangement is a 400', async () => {
        await expect(step({destination: 'ASSET', recipe: recipe('HEX')})).rejects.toMatchObject({statusCode: 400})
    })

    test('unknown destination is a 400', async () => {
        await expect(step({destination: 'DRIVE', recipe: recipe('RANDOM')})).rejects.toMatchObject({statusCode: 400})
    })

    test.each([
        ['SYSTEMATIC', 'random'],
        ['RANDOM', 'systematic']
    ])('%s arrangement refuses a %s state with a 400', async (strategy, kind) => {
        await expect(step({destination: 'ASSET', recipe: recipe(strategy), state: {kind, stage: 'final'}}))
            .rejects.toMatchObject({statusCode: 400})
    })

    test('a state of the matching kind is passed through', async () => {
        const state = {kind: 'random', stage: 'candidates'}

        await step({destination: 'ASSET', recipe: recipe('RANDOM'), state})

        expect(randomStep$).toHaveBeenCalledWith(expect.objectContaining({state}), {sepalUser})
    })
})

describe('samplingDesignStep$ names', () => {
    test.each(['RANDOM', 'SYSTEMATIC'])('sanitizes the task name and complete asset path for %s', async strategy => {
        const result = await step({
            description: 'Sudan sample design',
            assetId: 'projects/my-project/assets/Sudan samples/result 1',
            strategy: 'create',
            destination: 'ASSET',
            recipe: recipe(strategy)
        })

        expect(result.request).toEqual(expect.objectContaining({
            description: 'Sudan_sample_design',
            assetId: 'projects/my-project/assets/Sudan_samples/result_1',
            strategy: 'create',
            destination: 'ASSET'
        }))
    })

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

        expect(request).toEqual(expect.objectContaining({
            description: 'Sudan_sample_design',
            filenamePrefix: 'sample_locations_2024',
            workspacePath: 'results',
            fileFormat: 'CSV',
            destination: 'SEPAL'
        }))
        expect(request).not.toHaveProperty('assetId')
        expect(request).not.toHaveProperty('strategy')
    })

    test('SEPAL falls back to the sanitized task name as file prefix', async () => {
        const {request} = await step({
            description: 'Sudan sample design',
            workspacePath: 'results',
            fileFormat: 'CSV',
            destination: 'SEPAL',
            recipe: recipe('SYSTEMATIC')
        })

        expect(request).toEqual(expect.objectContaining({
            description: 'Sudan_sample_design',
            filenamePrefix: 'Sudan_sample_design'
        }))
    })
})

describe('cleanupTempAssets$', () => {
    test('refuses ids without a temp marker', async () => {
        const result = await lastValueFrom(cleanupTempAssets$({state: {tempAssetIds: ['projects/alice/assets/samples', TEMP]}}))

        expect(deleteAsset$).toHaveBeenCalledTimes(1)
        expect(deleteAsset$).toHaveBeenCalledWith(TEMP)
        expect(result).toEqual({deleted: [TEMP]})
    })

    test('a missing asset does not fail the cleanup', async () => {
        const other = `${TEMP}_candidates`
        deleteAsset$.mockImplementationOnce(() => throwError(() => new Error('not found')))

        const result = await lastValueFrom(cleanupTempAssets$({state: {tempAssetIds: [TEMP, other]}}))

        expect(result).toEqual({deleted: [other]})
    })

    test.each([undefined, null, {}, {tempAssetIds: 'x'}])('invalid state %j deletes nothing', async state => {
        expect(await lastValueFrom(cleanupTempAssets$({state}))).toEqual({deleted: []})
        expect(deleteAsset$).not.toHaveBeenCalled()
    })
})
