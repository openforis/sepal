const {job} = require('root/jobs/job')

const worker$ = ({tableId, columnName, columnValue, buffer, color = '#FFFFFF50', fillColor = '#FFFFFF08'}) => {
    const ee = require('ee')
    const {filterTable} = require('sepal/ee/table')
    const {forkJoin} = require('rx')
    const {map} = require('rx/operators')
    const _ = require('lodash')

    const bufferMeters = (buffer && _.toNumber(buffer)) * 1000
    const table = bufferMeters
        ? filterTable({tableId, columnName, columnValue})
            .map(feature => feature.buffer(ee.Number(bufferMeters)))
        : filterTable({tableId, columnName, columnValue})
    const geometry = bufferMeters
        ? table.geometry().buffer(ee.Number(bufferMeters))
        : table.geometry()
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
