const {timer, of} = require('rx')
const {mergeMap, map} = require('rx/operators')
const {limiter$} = require('./testLimiter')

module.exports = (minDuration, maxDuration = minDuration, errorProbability, {initArgs}) =>
    limiter$(
        of(true).pipe(
            map(() => Math.round(Math.random() * (maxDuration - minDuration) + minDuration)),
            mergeMap(duration =>
                timer(duration).pipe(
                    map(() => {
                        if (Math.random() < errorProbability / 100) {
                            throw new Error('Random error!')
                        }
                        return `${initArgs} ${duration}ms (${minDuration}-${maxDuration}ms)`
                    }),
                )
            )
        )
    )
