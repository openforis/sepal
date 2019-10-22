const {parentPort} = require('worker_threads')
const {Subject} = require('rxjs')
const {mergeMap} = require('rxjs/operators')

let subPort
parentPort.once('message', port => subPort = port)

// const globalRateLimit = bucket =>
//     observable$ => observable$.pipe(
//         mergeMap(value => {
//             const observable$ = new Subject()
//             subPort.once('message', () => {
//                 observable$.next(value)
//                 observable$.complete()
//             })
//             subPort.postMessage({
//                 type: 'globalRateLimit',
//                 bucket,
//                 value
//             })
//             return observable$
//         })
//     )

// const {of} = require('rxjs')

// module.exports = () => {
//     of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10).pipe(
//         globalRateLimit('foo')
//     ).subscribe(console.log)
// }
