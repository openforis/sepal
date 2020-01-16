const {Subject, concat, interval, of, pipe} = require('rxjs')
const {exhaustMap, filter, finalize, last, switchMap, takeUntil, windowTime} = require('rxjs/operators')

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')

const lastInWindow = time => pipe(
    windowTime(time),
    switchMap(window$ => concat(of(EMPTY_WINDOW), window$).pipe(last())),
    filter(value => value !== EMPTY_WINDOW)
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
