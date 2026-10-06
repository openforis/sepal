import {followEEExport, shareIfPublic} from '../eeExport.js'
import {forEachInParallel} from '../parallel.js'

const CONCURRENT_TILES = 3

export const collectionExport = async (kind, params, {sepal, report, signal, sleep}) => {
    report(prepareProgress(params.image.assetId || ''))
    report({defaultMessage: 'Tiling image', messageKey: 'tasks.ee.export.asset.tilingImage'})
    // Preparing may delete and create assets, so it is not retried either.
    const {assetId, tiles} = await sepal.startExport('task/export/collection/prepare', {kind, ...params})
    const totalTiles = tiles.length
    let completedTiles = tiles.filter(({retained}) => retained).length
    report({defaultMessage: `Start export of ${totalTiles} tiles`, messageKey: 'tasks.ee.export.asset.startExport', messageArgs: {tileCount: totalTiles}})
    const tileProgress = () => report({
        defaultMessage: `Exported ${completedTiles} of out of ${totalTiles} tiles.`,
        messageKey: 'tasks.retrieve.collection_to_asset.progress',
        messageArgs: {completedTiles, totalTiles}
    })
    tileProgress()
    await forEachInParallel(tiles.filter(({retained}) => !retained), CONCURRENT_TILES, signal, async ({tileIndex, tileId}, tileSignal) => {
        const {eeTaskId} = await sepal.startExport('task/export/collection/tile', {kind, ...params, tileIndex, tileId})
        await followEEExport({eeTaskId, sepal, report: () => {}, signal: tileSignal, sleep})
        if (!tileSignal.aborted) {
            completedTiles++
            tileProgress()
        }
    })
    await shareIfPublic({params, assetId, sepal, report, signal})
}

const prepareProgress = assetId => ({
    defaultMessage: `Prepare image collection${assetId ? ` ${assetId}` : ''}`,
    messageKey: 'tasks.ee.export.asset.prepareImageCollection',
    messageArgs: {assetId}
})
