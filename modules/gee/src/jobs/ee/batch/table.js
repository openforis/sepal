const {job} = require('#gee/jobs/job')
const {drive} = require('./drive')

const worker$ = (requestParams, {sepalUser}) => {
    // TODO: Only do this if there are free slots available to export
    // TODO: Make sure task is canceled when request is cancelled
    // TODO: Handle errrors
    const ee = require('#sepal/ee')
    const {interval, map, switchMap, takeLast, takeWhile} = require('rxjs')
    const moment = require('moment')

    const activeTasks = ee.data.listOperations(10)
        .filter(function (operation) {
            return !operation.done
        })
    console.log(activeTasks.length)

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

    function exportTableToDrive$({
        collection,
        description,
        folder,
        fileNamePrefix,
        fileFormat,
        selectors,
        maxVertices,
        priority
    }) {
        const task = ee.batch.Export.table.toDrive(
            collection, description, folder, fileNamePrefix, fileFormat, selectors, maxVertices, priority
        )
    
        task.start()
        const eeTaskId = task.id
        return interval(2 * 1000).pipe(
            switchMap(() => ee.$({
                description: 'doing some batch stuff',
                operation: (resolve, reject) =>
                    ee.data.getTaskStatus(eeTaskId,
                        (status, error) => error ? reject(error) : resolve(status)
                    )
            })),
            takeWhile(([{state}]) => ['UNSUBMITTED', 'READY', 'RUNNING'].includes(state), true),
            takeLast(1),
        )
    }
}

module.exports = job({
    jobName: 'Batch get EE Table rows',
    jobPath: __filename,
    worker$
})
