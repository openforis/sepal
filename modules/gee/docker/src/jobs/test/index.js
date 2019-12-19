const job = require('@sepal/worker/job')
const {withToken$} = require('@sepal/token')

const worker$ = (minDuration, maxDuration = minDuration, errorProbability = 0) => {
    const {timer, of} = require('rxjs')
    const {mergeMap, map} = require('rxjs/operators')
        
    return withToken$('jobs/test/tokenService',
        of(true).pipe(
            map(() => Math.round(Math.random() * (maxDuration - minDuration) + minDuration)),
            mergeMap(duration =>
                timer(duration).pipe(
                    map(() => {
                        if (Math.random() < errorProbability / 100) {
                            throw new Error('Random error!')
                        }
                        return `\n${duration} (${minDuration}-${maxDuration})`
                    }),
                )
            )
        )
    )
}

module.exports = job({
    jobName: 'Test1',
    jobPath: __filename,
    maxConcurrency: 20,
    minIdleCount: 5,
    maxIdleMilliseconds: 2000,
    // before: [require('./test_1'), require('./test_2')],
    args: ({params: {min, max, errorProbability}}) => [parseInt(min), parseInt(max), parseInt(errorProbability)],
    worker$,
})
