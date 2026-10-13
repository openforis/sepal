import {getTaskInfo} from './recipeOutputPath'

describe('getTaskInfo', () => {
    it('reports the Data folder as the output path of a Data export', () => {
        const recipe = {type: 'MOSAIC', projectId: 'p'}

        const taskInfo = getTaskInfo({
            recipe,
            destination: 'DATA',
            retrieveOptions: {dataPath: 'exports/r', filenamePrefix: 'prefix'}
        })

        expect(taskInfo).toMatchObject({destination: 'DATA', outputPath: 'exports/r', filenamePrefix: 'prefix'})
    })
})
