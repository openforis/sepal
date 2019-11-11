const log = require('../log')
const job = require('../job')
const eeAuth = require('./eeAuth')

const worker$ = ({tableId, columnName, columnValue, color}) => {
    const ee = require('@google/earthengine')
    const {filterTable} = require('../ee/table')
    const {getInfo$, getMap$} = require('./eeUtils')
    const {forkJoin} = require('rxjs')
    const {map} = require('rxjs/operators')

    log.info(`Request EE table map: tableId: ${tableId}, columnName: ${columnName}, columnValue: ${columnValue}`)

    const table = filterTable({tableId, columnName, columnValue})
    const geometry = table.geometry()

    const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
    const bounds$ = getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)]))
    const eeMap$ = getMap$(table, {color})
    return forkJoin({bounds: bounds$, eeMap: eeMap$}).pipe(
        map(({bounds, eeMap}) => ({bounds, ...eeMap}))
    )
}

module.exports = job({
    jobName: 'Request EE table map',
    jobPath: __filename,
    before: [eeAuth],
    worker$
})

