import moment from 'moment'
import {map, switchMap} from 'rxjs'

import {drive} from './drive.js'
import {exportTableToDrive$} from './exportTask.js'

export const exportToCSV$ = ({
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
