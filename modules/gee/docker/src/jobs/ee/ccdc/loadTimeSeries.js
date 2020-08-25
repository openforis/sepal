const {job} = require('root/jobs/job')

const worker$ = ({recipe, latLng}) => {
    const {getTimeSeries$} = require('sepal/ee/ccdc/ccdc')
    const {toGeometry} = require('sepal/ee/aoi')
    const {switchMap} = require('rx/operators')
    const ee = require('ee')
    const aoi = {type: 'POINT', ...latLng}
    return getTimeSeries$({...recipe, aoi}).pipe(
        switchMap(timeSeries =>
            ee.getInfo$(
                timeSeries.reduceRegion({
                    reducer: ee.Reducer.first(),
                    geometry: toGeometry(aoi),
                    scale: 1
                }),
                `Get CCDC time-series for pixel (${latLng})`
            )
        )
    )
}

module.exports = job({
    jobName: 'LoadCCDCChart',
    jobPath: __filename,
    worker$
})
