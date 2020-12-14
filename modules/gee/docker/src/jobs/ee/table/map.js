const {job} = require('root/jobs/job')

const worker$ = ({tableId, columnName, columnValue, color = '#FFFFFF50', fillColor = '#FFFFFF08'}) => {
    const ee = require('ee')
    const {filterTable} = require('sepal/ee/table')
    const {forkJoin} = require('rx')
    const {map} = require('rx/operators')

    const table = filterTable({tableId, columnName, columnValue})
    const geometry = table.geometry()
    const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
    return forkJoin({
        bounds: ee.getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)]), 'get bounds'),
        eeMap: ee.getMap$(table.style({color, fillColor}))
    }).pipe(
        map(({bounds, eeMap}) => ({bounds, ...eeMap}))
    )
}

module.exports = job({
    jobName: 'Request EE Table map',
    jobPath: __filename,
    args: ctx => [ctx.request.query],
    worker$
})
