import moment from 'moment'
import {finalize, switchMap} from 'rxjs'

import {getLogger} from '#sepal/log'

import {drive} from './drive.js'
import {exportTableToDrive$} from './exportTask.js'

const log = getLogger('ee/batch')

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
    const {createFolder$, readFile$, removeFolder$} = drive({sepalUser})

    // The folder is created up front because Earth Engine resolves the Drive destination by NAME and would
    // otherwise create one of its own at the Drive root. Everything after it is wrapped so the folder is removed
    // on success, failure and unsubscribe alike, and nothing is read once the export has failed. Cleanup is
    // subscribed separately and only logged: a Drive failure must never replace the error the caller needs.
    //
    // Unsubscribe is the one case that is not clean, and the cancel path accepts it: the delete wins the race
    // against the round trip that cancels the Earth Engine task, and because Earth Engine resolves the Drive
    // destination by name, a task that still writes recreates the folder at the Drive root, where nothing
    // collects it. Blocking on confirmed cancellation is not worth buying back that window.
    return createFolder$({path}).pipe(
        switchMap(() =>
            exportTableToDrive$({
                collection, description, folder, fileNamePrefix, selectors
            }).pipe(
                switchMap(() => readFile$({path})),
                finalize(() =>
                    removeFolder$({path}).subscribe({
                        error: error => log.error(`Drive export folder cleanup failed (${path})`, error)
                    })
                )
            )
        )
    )
}
