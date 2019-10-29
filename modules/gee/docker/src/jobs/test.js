const log = require('../log')
const job = require('../job')
const testBefore = require('./testBefore')

const worker$ = count => {
    const {of, timer} = require('rxjs')
    const {mergeMap, tap, mapTo} = require('rxjs/operators')
    const rateLimit = require('../job/operators/rateLimit')

    log.info(`Running Test with count: ${count}`)

    const sequence = [...Array(count).keys()]
    return of(...sequence).pipe(
        rateLimit(3, 1000),
        tap(value => log.trace(`Submitted value: ${value}`)),
        mergeMap(value =>
            timer(Math.random() * 2000).pipe(
                mapTo(value),
                tap(value => log.trace(`Got value: ${value}`)),
            )
        )
    )
}

module.exports = job({
    jobName: 'Test',
    jobPath: __filename,
    before: [testBefore],
    worker$
})
