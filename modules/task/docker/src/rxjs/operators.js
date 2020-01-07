const {Subject, interval, pipe} = require('rxjs')
const {exhaustMap, finalize, last, switchMap, takeUntil, windowTime} = require('rxjs/operators')

const lastInWindow = time => pipe(
    windowTime(time),
    switchMap(window$ => window$.pipe(last())),
)
const repeating = (project, rate) => {
    const finalized$ = new Subject()
    return pipe(
        finalize(() => finalized$.next(true)),
        switchMap(item =>
            interval(rate).pipe(
                exhaustMap(() => project(item)),
                takeUntil(finalized$)
            )
        )
    )
}

module.exports = {lastInWindow, repeating}
