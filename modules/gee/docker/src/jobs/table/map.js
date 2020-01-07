const job = require('root/worker/job')

const worker$ = ({tableId, columnName, columnValue, color = '#FFFFFF50', fillColor = '#FFFFFF08'}) => {
    const ee = require('@google/earthengine')
    const {filterTable} = require('root/ee/table')
    const {getInfo$, getMap$} = require('root/ee/utils')
    const {forkJoin} = require('rxjs')
    const {map} = require('rxjs/operators')

    const table = filterTable({tableId, columnName, columnValue})
    const geometry = table.geometry()
    const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
    return forkJoin({
        bounds: getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)])),
        eeMap: getMap$(table.style({color, fillColor}))
    }).pipe(
        map(({bounds, eeMap}) => ({bounds, ...eeMap}))
    )
}

module.exports = job({
    jobName: 'Request EE Table map',
    jobPath: __filename,
    before: [require('root/ee/initialize')],
    args: ctx => [ctx.request.query],
    worker$
})
