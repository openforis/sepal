import {catchError, map, of, switchMap, tap} from 'rxjs'

import {getLogger} from '#sepal/log'

const log = getLogger('ee/batch')

// EE export states that mean the task is still active. Kept as string literals (matching the original batch
// poll) so this cleanup decision stays unit-testable without initializing the EE singleton.
const RUNNING_STATES = ['UNSUBMITTED', 'READY', 'RUNNING']

export const isRunning = state => RUNNING_STATES.includes(state)

// Best-effort cancellation of a still-running EE export task. Checks status once without retry; cancels
// (with retries) only if the task is still running, and leaves terminal tasks alone. If the status check
// fails, falls back to a direct cancel - mirroring modules/task/src/ee/task.js. `status$` and `cancel$` are
// injected so this is testable without EE.
export const cleanupExportTask$ = ({eeTaskId, description, status$, cancel$}) => {
    log.debug(() => `EE export task cleanup starting (${description}, ${eeTaskId})`)
    return status$({eeTaskId, description, maxRetries: 0}).pipe(
        map(({state}) => isRunning(state)),
        switchMap(running =>
            running
                ? cancel$({eeTaskId, description, maxRetries: 3}).pipe(map(() => true))
                : of(false)
        ),
        tap(wasRunning =>
            log.info(`EE export task ${wasRunning ? 'cancelled' : 'already terminal'} (${description}, ${eeTaskId})`)
        ),
        catchError(error => {
            log.error(`EE export task status check failed during cleanup; cancelling directly (${description}, ${eeTaskId})`, error)
            return cancel$({eeTaskId, description, maxRetries: 0})
        })
    )
}
