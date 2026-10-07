import crypto from 'crypto'
import moment from 'moment'
import {defer, map, of} from 'rxjs'

import ee from '#sepal/ee/ee'

const TEMP_ASSET_ID = /(_tmp_\d{17}|\/sampling_design_tmp_\d{17}_[0-9a-f]{6})(_candidates|_additional_candidates(_\d+)?|_selected)?$/

// Clearly temporary and collision-free, so a stray temp asset is never mistaken for a result, and cleanup can
// tell temp assets from the user's own.
export const tempAssetPrefix$ = ({assetId}) => defer(() => {
    const timestamp = moment().format('YYYYMMDDHHmmssSSS')
    return assetId
        ? of(`${assetId}_tmp_${timestamp}`)
        : ee.listBuckets$('projects/earthengine-legacy').pipe(
            map(({assets}) => {
                if (!assets?.length) {
                    throw new Error('EE account has no asset roots')
                }
                return `${assets[0].id}/sampling_design_tmp_${timestamp}_${crypto.randomBytes(3).toString('hex')}`
            })
        )
})

export const isTempAssetId = id => typeof id === 'string' && TEMP_ASSET_ID.test(id)
