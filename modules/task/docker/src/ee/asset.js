const ee = require('ee')
const {EMPTY} = require('rxjs')
const {map, switchMap} = require('rxjs/operators')
const {progress} = require('root/rxjs/operators')

const deleteAsset$ = assetId =>
    ee.getAsset$(assetId).pipe(
        switchMap(asset => asset ? delete$(assetId) : EMPTY)
    )

const delete$ = assetId =>
    ee.$('delete asset', (resolve, reject) =>
        ee.data.deleteAsset(assetId,
            (deleted_, error) => error ? reject(error) : resolve()
        )
    ).pipe(
        progress({
            defaultMessage: `Deleted asset '${assetId}'`,
            messageKey: 'tasks.ee.export.asset.delete',
            messageArgs: {assetId}
        })
    )

module.exports = {deleteAsset$}
