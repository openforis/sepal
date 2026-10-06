import {followEEExport} from '../eeExport.js'

export const ccdcAssetExport = async (params, {sepal, report, signal, sleep}) => {
    const {eeTaskId, assetId} = await sepal.startExport('task/export/ccdc/asset', params)
    await followEEExport({eeTaskId, sepal, report, signal, sleep})
    if (!signal.aborted && params.image?.sharing === 'PUBLIC') {
        report({messageKey: 'tasks.ee.export.asset.share', defaultMessage: `Sharing asset '${assetId}'`, messageArgs: {assetId}})
        await sepal.gee('task/asset/share', {assetId})
    }
}
