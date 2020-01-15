const job = require('root/jobs/job')
const {limiter} = require('./testLimiter')

const worker$ = (...args) => {
    return require('./test')(...args)
}

// const worker$ = (minDuration, maxDuration = minDuration, errorProbability) => {
//     const {timer, of} = require('rxjs')
//     const {mergeMap, map} = require('rxjs/operators')
//     const {limiter$} = require('./testLimiter')

//     return limiter$(
//         of(true).pipe(
//             map(() => Math.round(Math.random() * (maxDuration - minDuration) + minDuration)),
//             mergeMap(duration =>
//                 timer(duration).pipe(
//                     map(() => {
//                         if (Math.random() < errorProbability / 100) {
//                             throw new Error('Random error!')
//                         }
//                         return `${duration}ms (${minDuration}-${maxDuration}ms)`
//                     }),
//                 )
//             )
//         )
//     )
// }

module.exports = job({
    jobName: 'Test1',
    jobPath: __filename,
    maxConcurrency: 200,
    minIdleCount: 5,
    maxIdleMilliseconds: 2000,
    services: [limiter],
    // before: [require('./test_1'), require('./test_2')],
    args: ({params: {min, max, errorProbability}}) => [parseInt(min), parseInt(max), parseInt(errorProbability)],
    worker$,
})
