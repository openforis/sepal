import {setTimeout} from 'timers/promises'

import {getLogger} from '#sepal/log'

const log = getLogger('ee')

const POLL_MS = 10 * 1000

const PROGRESS = {
    UNSUBMITTED: {messageKey: 'tasks.ee.export.pending', defaultMessage: 'Submitting export task to Google Earth Engine'},
    READY: {messageKey: 'tasks.ee.export.ready', defaultMessage: 'Waiting for Google Earth Engine to start export'},
    RUNNING: {messageKey: 'tasks.ee.export.running', defaultMessage: 'Google Earth Engine is exporting'},
    CANCEL_REQUESTED: {messageKey: 'tasks.ee.export.running', defaultMessage: 'Google Earth Engine is exporting'}
}

// Follows an export Earth Engine runs on Google's side until it ends. Only COMPLETED completes; an export
// cancelled or lost on Google's side fails the task.
export const followEEExport = async ({eeTaskId, sepal, report, signal, sleep = sleepUnlessAborted}) => {
    let reportedState = null
    while (!signal.aborted) {
        const {state, errorMessage} = await sepal.gee('task/operation/status', {eeTaskId})
        if (state === 'COMPLETED') {
            return
        }
        if (!PROGRESS[state]) {
            throw exportFailure(state, errorMessage)
        }
        if (state !== reportedState) {
            report(PROGRESS[state])
            reportedState = state
        }
        await sleep(POLL_MS, signal)
    }
    await cancel(eeTaskId, sepal)
}

const sleepUnlessAborted = (ms, signal) =>
    setTimeout(ms, undefined, {signal}).catch(() => {})

const cancel = async (eeTaskId, sepal) => {
    try {
        await sepal.gee('task/operation/cancel', {eeTaskId})
        log.info(`Earth Engine task ${eeTaskId} cancelled`)
    } catch (error) {
        log.error(`Earth Engine task ${eeTaskId} could not be cancelled`, error)
    }
}

const exportFailure = (state, errorMessage) => {
    const reason = errorMessage || (state === 'CANCELLED'
        ? 'the export was cancelled in Google Earth Engine'
        : `the export ended in state ${state}`)
    return Object.assign(new Error(`Earth Engine export ${state}: ${reason}`), {earthEngineMessage: reason})
}
