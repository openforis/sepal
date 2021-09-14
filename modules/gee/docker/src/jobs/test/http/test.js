const {timer, of} = require('rxjs')
const {mergeMap, map} = require('rxjs/operators')
const {limiter$} = require('./testLimiter')

module.exports = (minDuration, maxDuration = minDuration, errorProbability, {initArgs: {hello}}) =>
    limiter$(
        of(true).pipe(
            map(() => Math.round(Math.random() * (maxDuration - minDuration) + minDuration)),
            mergeMap(duration =>
                timer(duration).pipe(
                    map(() => {
                        if (Math.random() < errorProbability / 100) {
                            throw new Error('Random error!')
                        }
                        return `${hello} ${duration}ms (${minDuration}-${maxDuration}ms)`
                    }),
                )
            )
        )
    )
