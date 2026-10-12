import {defer, map} from 'rxjs'

import ee from '#sepal/ee/ee'
import {currentEEContext} from '#sepal/ee/eeContext'

const PUBLIC_READ = {bindings: [{role: 'roles/viewer', members: ['allUsers']}]}

export const operationStatus$ = ({eeTaskId}) =>
    ee.getTaskStatus$(eeTaskId, `task status (${eeTaskId})`).pipe(
        map(({state, error_message: errorMessage}) => ({state, errorMessage: errorMessage ?? null}))
    )

export const operationCancel$ = ({eeTaskId}) =>
    ee.cancelTask$(eeTaskId, `cancel task (${eeTaskId})`, 3).pipe(
        map(() => ({}))
    )

export const shareAsset$ = ({assetId}) => defer(() => {
    if (currentEEContext().auth.type === 'serviceAccount') {
        throw new Error('Cannot share an asset using service account.')
    }
    return ee.setAssetIamPolicy$(assetId, PUBLIC_READ).pipe(
        map(() => ({}))
    )
})
