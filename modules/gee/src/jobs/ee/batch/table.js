import moment from 'moment'
import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {fileName} from '#sepal/path'

import {drive} from './drive.js'
import {exportTableToDrive$} from './exportTask.js'

const worker$ = (requestParams, {sepalUser}) => {
    // TODO: Only do this if there are free slots available to export
    // TODO: Handle errrors
    const activeTasks = ee.data.listOperations(10)
        .filter(function (operation) {
            return !operation.done
        })
    console.info(activeTasks.length)

    const image = ee.Image('projects/sepal-dev-342113/assets/sudan-dynamic-world-2023')
    const reduced = image.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: image.geometry(),
        scale: 10,
        maxPixels: 1e13,
        tileScale: 1
    })
    const collection = ee.FeatureCollection([ee.Feature(null, reduced)])

    const description = 'the-exported-table-4'
    const parentFolder = 'SEPAL/export'
    const folder = `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`
    const path = `${parentFolder}/${folder}`
    const fileNamePrefix = description

    return drive({sepalUser}).createFolder$({path}).pipe(
        switchMap(() =>
            exportTableToDrive$({
                collection, description, folder, fileNamePrefix
            })
        ),
        switchMap(() =>
            drive({sepalUser}).readFile$({path})
        ),
        switchMap(table =>
            drive({sepalUser}).removeFolder$({path}).pipe(
                map(() => table)
            )
        )
    )
}

export default job({
    jobName: 'Batch get EE Table rows',
    jobPath: fileName(import.meta.url),
    worker$
})
