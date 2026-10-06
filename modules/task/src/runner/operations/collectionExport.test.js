import {operations} from '../operations.js'
import {collectionExport} from './collectionExport.js'

test('prepares the collection, exports the tiles a resume does not keep, then shares it', async () => {
    const params = {image: {assetId: 'projects/p/assets/c', sharing: 'PUBLIC'}}
    const sepal = fakeSepal({
        prepared: {assetId: 'projects/p/assets/c', tiles: [{tileIndex: 0, tileId: 'a', retained: true}, {tileIndex: 1, tileId: 'b', retained: false}]}
    })

    await collectionExport('image', params, context(sepal))

    const starts = sepal.calls.filter(({kind}) => kind === 'start')
    expect(starts.map(({path, body}) => ({path, body}))).toEqual([
        {path: 'task/export/collection/tile', body: {kind: 'image', ...params, tileIndex: 1, tileId: 'b'}}
    ])
    expect(sepal.calls.at(-1)).toMatchObject({path: 'task/asset/share', body: {assetId: 'projects/p/assets/c'}})
})

test('reports collection progress with the existing messages', async () => {
    const sepal = fakeSepal({
        prepared: {assetId: 'a', tiles: [{tileIndex: 0, tileId: 'a', retained: false}, {tileIndex: 1, tileId: 'b', retained: false}]}
    })
    const reports = []

    await collectionExport('image', {image: {assetId: 'a'}}, {...context(sepal), report: message => reports.push(message)})

    const keyed = reports.map(({messageKey, messageArgs}) => ({messageKey, messageArgs}))
    expect(keyed).toEqual(expect.arrayContaining([
        {messageKey: 'tasks.ee.export.asset.prepareImageCollection', messageArgs: {assetId: 'a'}},
        {messageKey: 'tasks.ee.export.asset.tilingImage', messageArgs: undefined},
        {messageKey: 'tasks.ee.export.asset.startExport', messageArgs: {tileCount: 2}},
        {messageKey: 'tasks.retrieve.collection_to_asset.progress', messageArgs: {completedTiles: 2, totalTiles: 2}}
    ]))
})

test('one failed tile cancels the tiles still running', async () => {
    const sepal = fakeSepal({
        prepared: {assetId: 'a', tiles: ['a', 'b', 'c'].map((tileId, tileIndex) => ({tileIndex, tileId, retained: false}))},
        states: {T0: 'FAILED', T1: 'RUNNING', T2: 'RUNNING'}
    })
    const sleep = (_ms, signal) => new Promise(resolve => signal.aborted ? resolve() : signal.addEventListener('abort', resolve))

    await expect(collectionExport('image', {image: {assetId: 'a'}}, {...context(sepal), sleep})).rejects.toThrow('FAILED')

    const cancelled = sepal.calls.filter(({path}) => path === 'task/operation/cancel').map(({body}) => body.eeTaskId)
    expect(cancelled.sort()).toEqual(['T1', 'T2'])
    expect(sepal.calls.map(({path}) => path)).not.toContain('task/asset/share')
})

test('an image export to an ImageCollection asset goes through the collection', async () => {
    const sepal = fakeSepal({prepared: {assetId: 'a', tiles: []}})

    await operations['image.GEE']({image: {assetType: 'ImageCollection', assetId: 'a'}}, context(sepal))

    expect(sepal.calls[0]).toMatchObject({path: 'task/export/collection/prepare', body: {kind: 'image'}})
})

test('a CCDC export to an ImageCollection asset goes through the collection', async () => {
    const sepal = fakeSepal({prepared: {assetId: 'a', tiles: []}})

    await operations['ccdc.GEE']({image: {assetType: 'ImageCollection', assetId: 'a'}}, context(sepal))

    expect(sepal.calls[0]).toMatchObject({path: 'task/export/collection/prepare', body: {kind: 'ccdc'}})
})

const fakeSepal = ({prepared, states = {}}) => {
    const calls = []
    let started = 0
    return {
        calls,
        gee: async (path, body) => {
            calls.push({path, body})
            if (path === 'task/export/collection/prepare') {
                return prepared
            }
            if (path === 'task/operation/status') {
                return {state: states[body.eeTaskId] ?? 'COMPLETED'}
            }
            return {}
        },
        startExport: async (path, body) => {
            calls.push({kind: 'start', path, body})
            return {eeTaskId: `T${started++}`}
        }
    }
}

const context = sepal => ({sepal, report: () => {}, signal: new AbortController().signal, sleep: async () => {}})
