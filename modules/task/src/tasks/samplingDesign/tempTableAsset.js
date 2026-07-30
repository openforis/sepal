import moment from 'moment'
import {map, of} from 'rxjs'

import ee from '#sepal/ee/ee'

// A unique, clearly-temporary EE table asset id for a Sampling Design export. Systematic uses it to materialize
// candidate sets; stratified random uses it to materialize the sample for validation before promotion. A GEE
// destination derives a sibling of the requested assetId; a SEPAL destination has no assetId, so it uses the
// user's first EE asset root. The `_tmp_`/`sampling_design_tmp_` marker plus timestamp keeps it obviously
// temporary and collision-free, so a stray temp asset can never be mistaken for a valid result.
export const tempTableAssetId$ = (taskId, assetId) => {
    const timestamp = moment().format('YYYYMMDDHHmmssSSS')
    if (assetId) {
        return of(`${assetId}_tmp_${timestamp}`)
    }
    return ee.listBuckets$('projects/earthengine-legacy').pipe(
        map(({assets}) => {
            if (!assets?.length) {
                throw new Error('EE account has no asset roots')
            }
            return `${assets[0].id}/sampling_design_tmp_${taskId}_${timestamp}`
        })
    )
}
