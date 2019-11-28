const job = require('@sepal/worker/job')

const worker$ = (minDuration, maxDuration = minDuration) => {
    const {of, timer} = require('rxjs')
    const {mergeMap, map} = require('rxjs/operators')

    return of(true).pipe(
        map(() => Math.round(Math.random() * (maxDuration - minDuration) + minDuration)),
        mergeMap(duration =>
            timer(duration).pipe(
                map(() => {
                    if (Math.random() < .5) {
                        // throw new Error('Random error!')
                    }
                    return `\n${duration} (${minDuration}-${maxDuration})`
                }),
            )
        )
    )
}

module.exports = job({
    jobName: 'Test1',
    jobPath: __filename,
    minIdleCount: 1,
    maxIdleMilliseconds: 2000,
    before: [require('./test_1'), require('./test_2')],
    args: ({params: {min, max}}) => [parseInt(min), parseInt(max)],
    worker$,
})
