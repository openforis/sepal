const {drive} = require('./drive')
const ee = require('#sepal/ee')
const {interval, map, switchMap, takeLast, takeWhile} = require('rxjs')
const moment = require('moment')

const exportToCSV$ = ({
    collection,
    description,
    selectors,
    sepalUser,
}) => {
    const parentFolder = 'SEPAL/export'
    const folder = `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`
    const path = `${parentFolder}/${folder}`
    const fileNamePrefix = description

    return drive({sepalUser}).createFolder$({path}).pipe(
        switchMap(() =>
            exportTableToDrive$({
                collection, description, folder, fileNamePrefix, selectors
            })
        ),
        switchMap(() =>
            drive({sepalUser}).readFile$({path})
        ),
        // TODO: This should be a finalization somehow
        switchMap(table =>
            drive({sepalUser}).removeFolder$({path}).pipe(
                map(() => table)
            )
        )
    )

}

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

module.exports = {exportToCSV$}
