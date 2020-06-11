const {Subject} = require('rx')
const {mergeMap, takeUntil, filter, tap} = require('rx/operators')
const log = require('sepal/log').getLogger('task')
const {executeTask$} = require('./taskRunner')

const task$ = new Subject()
const cancel$ = new Subject()

const submitTask = task => {
    log.fatal('TASK SUBMISSION', task)
    task$.next(task)
}

const cancelTask = id => {
    log.fatal('TASK CANCELLATION', id)
    cancel$.next(id)
}

task$.pipe(
    mergeMap(task => executeTask$(task).pipe(
        takeUntil(cancel$.pipe(
            filter(id => id === task.id),
            tap(() => log.fatal('TASK CANCELLED', task.id))
        ))
    ))
).subscribe({
    next: v => log.fatal('*** VALUE', v),
    error: e => log.fatal('*** FAILED', e),
    complete: () => log.fatal('*** COMPLETE')
})

module.exports = {submitTask, cancelTask}
