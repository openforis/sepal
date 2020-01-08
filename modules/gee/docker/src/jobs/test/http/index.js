const job = require('root/jobs/job')

const worker$ = (minDuration, maxDuration = minDuration, errorProbability = 0) => {
    const {withLimiter$} = require('root/limiter')
    const limiter$ = withLimiter$('jobs/test/limiter')
    const {timer, of} = require('rxjs')
    const {mergeMap, map} = require('rxjs/operators')
    // const foo = require('sepalLog')
        
    return limiter$(
        of(true).pipe(
            map(() => Math.round(Math.random() * (maxDuration - minDuration) + minDuration)),
            mergeMap(duration =>
                timer(duration).pipe(
                    map(() => {
                        if (Math.random() < errorProbability / 100) {
                            throw new Error('Random error!')
                        }
                        return `${duration}ms (${minDuration}-${maxDuration}ms)`
                    }),
                )
            )
        )
    )
}

module.exports = job({
    jobName: 'Test1',
    jobPath: __filename,
    concurrencyLimit: 20,
    minIdleCount: 5,
    maxIdleMilliseconds: 2000,
    // before: [require('./test_1'), require('./test_2')],
    args: ({params: {min, max, errorProbability}}) => [parseInt(min), parseInt(max), parseInt(errorProbability)],
    worker$,
})
