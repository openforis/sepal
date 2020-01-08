const {switchMap, tap, finalize} = require('rxjs/operators')
const _ = require('lodash')
const log = require('sepalLog')('job')
const {initWorker$} = require('../worker/factory')

const submit$ = ({jobName, jobPath, args, args$}) =>
    initWorker$(jobName, jobPath).pipe(
        tap(() => log.trace(`Submitting job [${jobName}] to single worker`)),
        switchMap(({submit$, dispose}) =>
            submit$(args, args$).pipe(
                finalize(() => dispose())
            )
        )
    )

module.exports = {
    submit$
}
