const job = require('@sepal/worker/job')
const {withToken$} = require('@sepal/token')

const worker$ = (minDuration, maxDuration = minDuration) => {
    const {timer, of} = require('rxjs')
    const {mergeMap, map} = require('rxjs/operators')
        
    // return withToken$('test',
    return of(true).pipe(
        map(() => Math.round(Math.random() * (maxDuration - minDuration) + minDuration)),
        mergeMap(duration =>
            timer(duration).pipe(
                map(() => {
                    if (Math.random() < 1) {
                        // throw new Error('Random error!')
                    }
                    return `\n${duration} (${minDuration}-${maxDuration})`
                }),
            )
        )
    )
    // )
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
