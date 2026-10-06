import {operations} from '../operations.js'

const client = ({start, status = [{state: 'COMPLETED'}]}) => {
    const calls = []
    return {
        calls,
        sepal: {
            startExport: async (path, body) => {
                calls.push({path, body})
                return start
            },
            gee: async (path, body) => {
                calls.push({path, body})
                return path === 'task/operation/status' ? status.shift() : {}
            }
        }
    }
}

const run = (operation, params, sepal) =>
    operations[operation](params, {sepal, report: () => {}, signal: new AbortController().signal, sleep: async () => {}})

test('an image export to asset starts in gee, is followed, then shared when asked', async () => {
    const params = {image: {recipe: {type: 'MOSAIC'}, sharing: 'PUBLIC'}}
    const {sepal, calls} = client({start: {eeTaskId: 'T1', assetId: 'projects/p/assets/out'}})

    await run('image.GEE', params, sepal)

    expect(calls.map(({path}) => path)).toEqual(['task/export/image/asset', 'task/operation/status', 'task/asset/share'])
    expect(calls[0].body).toBe(params)
    expect(calls[2].body).toEqual({assetId: 'projects/p/assets/out'})
})

test('a CCDC export to asset starts in gee and is followed', async () => {
    const {sepal, calls} = client({start: {eeTaskId: 'T2', assetId: 'a'}})

    await run('ccdc.GEE', {image: {recipe: {type: 'CCDC'}}, description: 'd'}, sepal)

    expect(calls.map(({path}) => path)).toEqual(['task/export/ccdc/asset', 'task/operation/status'])
})

test('a Drive export a user without a Google account cannot make completes without following anything', async () => {
    const {sepal, calls} = client({start: {eeTaskId: null}})

    await run('image.DRIVE', {image: {recipe: {type: 'MOSAIC'}}}, sepal)

    expect(calls.map(({path}) => path)).toEqual(['task/export/image/drive'])
})
