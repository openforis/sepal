import _ from 'lodash'
import {forkJoin, map} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {filterTable} from '#sepal/ee/table'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {tableId, columnName, columnValue, buffer, color = '#FFFFFF50', fillColor = '#FFFFFF08'}
}) => {

    const bufferMeters = (buffer && _.toNumber(buffer)) * 1000
    const table = bufferMeters
        ? filterTable({tableId, columnName, columnValue})
            .map(feature => feature.buffer(ee.Number(bufferMeters), bufferMeters / 10))
        : filterTable({tableId, columnName, columnValue})
    const bounds = bufferMeters
        ? table.geometry().bounds(bufferMeters / 10).buffer(ee.Number(bufferMeters), bufferMeters / 10).bounds(bufferMeters / 10)
        : table.geometry().bounds()
    const boundsPolygon = ee.List(bounds.coordinates().get(0))
    return forkJoin({
        bounds: ee.getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)]), 'get bounds'),
        eeMap: ee.getMap$(table.style({color, fillColor}), null, 'create ee table map')
    }).pipe(
        map(({bounds, eeMap}) => ({bounds, ...eeMap}))
    )
}

export default job({
    jobName: 'Request EE Table map',
    jobPath: fileName(import.meta.url),
    worker$
})
