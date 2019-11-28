const job = require('@sepal/worker/job')

const worker$ = ({tableId, columnName, columnValue, color}) => {
    const ee = require('@google/earthengine')
    const {filterTable} = require('@sepal/ee/table')
    const {getInfo$, getMap$} = require('@sepal/ee/utils')
    const {forkJoin} = require('rxjs')
    const {map} = require('rxjs/operators')

    const table = filterTable({tableId, columnName, columnValue})
    const geometry = table.geometry()
    const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))

    return forkJoin({
        bounds: getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)])),
        eeMap: getMap$(table, {color})
    }).pipe(
        map(({bounds, eeMap}) => ({bounds, ...eeMap}))
    )
}

module.exports = job({
    jobName: 'Request EE Table map',
    jobPath: __filename,
    before: [require('@sepal/ee/initialize')],
    args: ctx => [ctx.request.query],
    worker$
})
