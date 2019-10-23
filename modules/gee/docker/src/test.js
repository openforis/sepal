const {of, timer} = require('rxjs')
const {mergeMap, tap, mapTo} = require('rxjs/operators')
const rateLimit = require('./job/operators/rateLimit')

module.exports = (dummy, onError, onComplete) => {
    console.log(`Running test ${dummy}`)
    of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10).pipe(
        rateLimit(3, 1000),
        tap(value => console.log(`Submitted: ${value}`)),
        mergeMap(value =>
            timer(Math.random() * 2000).pipe(
                mapTo(value)
            )
        )
    ).subscribe(
        value => console.log(`Got: ${value}`),
        error => onError && onError(error),
        () => onComplete && onComplete('done!')
    )
}
