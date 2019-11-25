const {switchMap, tap, finalize} = require('rxjs/operators')
const _ = require('lodash')
const log = require('@sepal/log')
const {initWorker$} = require('./factory')

const submit$ = (jobName, jobPath, args, args$) =>
    initWorker$(jobName, jobPath).pipe(
        tap(() => log.trace(`Submitting <${jobName}> to single worker`)),
        switchMap(({submit$, dispose$}) =>
            submit$(args, args$).pipe(
                finalize(() => dispose$.next())
            )
        )
    )

module.exports = {
    submit$
}
