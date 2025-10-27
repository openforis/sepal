const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {sceneId}
}) => {
    const ee = require('#sepal/ee/ee')
    const {map} = require('rxjs')

    return ee.getInfo$(
        ee.Image(sceneId).get('L1_LANDSAT_PRODUCT_ID')
    ).pipe(
        map(landsatProductId => ({landsatProductId}))
    )
}

module.exports = job({
    jobName: 'Landsat Product ID',
    jobPath: __filename,
    worker$
})
