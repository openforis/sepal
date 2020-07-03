const {EMPTY, ReplaySubject, defer} = require('rx')
const {first, scan, switchMapTo, takeWhile} = require('rx/operators')

let _finalizeSubject

module.exports = {
    _addFinalize: () => {
        if (!_finalizeSubject)
            _finalizeSubject = new ReplaySubject()
        _finalizeSubject.next(1)
    },
    _completeFinalize: () => _finalizeSubject.next(-1),

    finalize$: defer(() => _finalizeSubject
        ? _finalizeSubject.pipe(
            scan((acc, next) => acc + next),
            takeWhile(acc => acc > 0),
            switchMapTo(EMPTY)
        )
        : EMPTY
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
