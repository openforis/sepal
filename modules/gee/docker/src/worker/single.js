const {finalize} = require('rxjs/operators')
const _ = require('lodash')
const log = require('../log')
const {initWorker} = require('./manager')

const submit$ = (jobName, jobPath, args) => {
    log.trace(`Submitting <${jobName}> to single worker`)
    const {submit$, dispose} = initWorker(jobName, jobPath)
    return args = submit$(args).pipe(
        finalize(() => dispose())
    )
}

module.exports = {
    submit$
}
