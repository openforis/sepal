const {timer, of, mergeMap, map} = require('rxjs')
const {testLimiter$} = require('./testLimiter')

module.exports = ({
    requestArgs: {minDuration, maxDuration = minDuration, errorProbability},
    initArgs: {mode}
}) =>
    testLimiter$(
        of(true).pipe(
            map(() => Math.round(Math.random() * (maxDuration - minDuration) + minDuration)),
            mergeMap(duration =>
                timer(duration).pipe(
                    map(() => {
                        if (Math.random() < errorProbability / 100) {
                            throw new Error('Random error!')
                        }
                        return `${mode} ${duration}ms (${minDuration}-${maxDuration}ms)\n`
                    })
                )
            )
        )
    )
