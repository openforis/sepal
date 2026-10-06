import {map} from 'rxjs'

import ee from '#sepal/ee/ee'

const PUBLIC_READ = {bindings: [{role: 'roles/viewer', members: ['allUsers']}]}

export const operationStatus$ = ({eeTaskId}) =>
    ee.getTaskStatus$(eeTaskId, `task status (${eeTaskId})`).pipe(
        map(({state, error_message: errorMessage}) => ({state, errorMessage: errorMessage ?? null}))
    )

export const operationCancel$ = ({eeTaskId}) =>
    ee.cancelTask$(eeTaskId, `cancel task (${eeTaskId})`, 3).pipe(
        map(() => ({}))
    )

export const shareAsset$ = ({assetId}) =>
    ee.setAssetIamPolicy$(assetId, PUBLIC_READ).pipe(
        map(() => ({}))
    )
