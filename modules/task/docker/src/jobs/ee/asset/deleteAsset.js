const job = require('root/jobs/job')

const worker$ = assetId => {
    const ee = require('ee')
    const {EMPTY} = require('rxjs')
    const {catchError} = require('rxjs/operators')
    const {progress} = require('root/rxjs/operators')

    return ee.deleteAsset$(assetId).pipe(
        progress({
            defaultMessage: `Deleted asset '${assetId}'`,
            messageKey: 'tasks.ee.export.asset.delete',
            messageArgs: {assetId}
        }),
        catchError(() => EMPTY)
    )

    // return ee.getAsset$(assetId).pipe(
    //     catchError(() => EMPTY),
    //     switchMap(asset => asset
    //         ? ee.deleteAsset$(assetId).pipe(
    //             progress({
    //                 defaultMessage: `Deleted asset '${assetId}'`,
    //                 messageKey: 'tasks.ee.export.asset.delete',
    //                 messageArgs: {assetId}
    //             })
    //         )
    //         : EMPTY
    //     )
    // )
}

module.exports = job({
    jobName: 'Delete asset',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ({assetId}) => [assetId],
    worker$
})
