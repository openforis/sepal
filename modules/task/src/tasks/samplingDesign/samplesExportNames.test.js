import {jest} from '@jest/globals'

const exportRandomToAssets$ = jest.fn(options => options)
const exportSystematicToAssets$ = jest.fn(options => options)
const setWorkloadTag = jest.fn()

jest.unstable_mockModule('../workloadTag.js', () => ({setWorkloadTag}))
jest.unstable_mockModule('./randomExport.js', () => ({exportRandomToAssets$}))
jest.unstable_mockModule('./systematicExport.js', () => ({exportSystematicToAssets$}))

const assetExport = await import('./samplesAssetExport.js')
const sepalExport = await import('./samplesSepalExport.js')

const recipe = arrangementStrategy => ({
    model: {sampleArrangement: {arrangementStrategy}}
})

beforeEach(() => jest.clearAllMocks())

describe('Sampling Design asset export names', () => {
    it.each(['RANDOM', 'SYSTEMATIC'])('sanitizes the task name and complete asset path for %s', arrangementStrategy => {
        assetExport.submit$('task-1', {
            description: 'Sudan sample design',
            assetId: 'projects/my-project/assets/Sudan samples/result 1',
            strategy: 'create',
            properties: {source: 'test'},
            recipe: recipe(arrangementStrategy)
        })

        const exporter = arrangementStrategy === 'RANDOM' ? exportRandomToAssets$ : exportSystematicToAssets$
        expect(exporter).toHaveBeenCalledWith(expect.objectContaining({
            description: 'Sudan_sample_design',
            assetId: 'projects/my-project/assets/Sudan_samples/result_1',
            destination: 'ASSET'
        }))
    })
})

describe('Sampling Design SEPAL export names', () => {
    it('sanitizes the Earth Engine task name and file prefix', () => {
        sepalExport.submit$('task-1', {
            description: 'Sudan sample design',
            filenamePrefix: 'sample locations 2024',
            workspacePath: 'results',
            fileFormat: 'CSV',
            recipe: recipe('RANDOM')
        })

        expect(exportRandomToAssets$).toHaveBeenCalledWith(expect.objectContaining({
            description: 'Sudan_sample_design',
            filenamePrefix: 'sample_locations_2024',
            destination: 'SEPAL'
        }))
    })

    it('uses the sanitized task name when no file prefix is supplied', () => {
        sepalExport.submit$('task-1', {
            description: 'Sudan sample design',
            workspacePath: 'results',
            fileFormat: 'CSV',
            recipe: recipe('SYSTEMATIC')
        })

        expect(exportSystematicToAssets$).toHaveBeenCalledWith(expect.objectContaining({
            description: 'Sudan_sample_design',
            filenamePrefix: 'Sudan_sample_design'
        }))
    })
})
