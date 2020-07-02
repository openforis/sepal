const {EMPTY, Subject, ReplaySubject} = require('rx')
const {first, scan, share, switchMapTo, takeWhile} = require('rx/operators')

const _finalizeSubject = new Subject()

module.exports = {
    _finalizeSubject,

    finalize$: _finalizeSubject.pipe(
        scan((acc, next) => acc + next),
        takeWhile(acc => acc > 0),
        switchMapTo(EMPTY),
        share()
    ),

    promise$: callback => {
        const $ = new ReplaySubject()
        const resolve = value => $.next(value)
        const reject = error => $.error(error)
        try {
            callback(resolve, reject)
        } catch (error) {
            reject(error)
        }
        return $.pipe(first())
    },

    fromPromise: promise => {
        const $ = new ReplaySubject()
        promise
            .then(value => $.next(value))
            .catch(error => $.error(error))
        return $.pipe(first())
    }
}
