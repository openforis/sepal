const {EMPTY, ReplaySubject, defer} = require('rx')
const {first, scan, switchMapTo, takeWhile, tap} = require('rx/operators')
const log = require('sepal/log').getLogger('rxjs')

let _finalizeSubject

module.exports = {
    _addFinalize: description => {
        if (!_finalizeSubject)
            _finalizeSubject = new ReplaySubject()
        _finalizeSubject.next({description, value: 1})
    },
    _completeFinalize: description => setTimeout(() => _finalizeSubject.next({description, value: -1}), 3000),

    finalize$: defer(() => _finalizeSubject
        ? _finalizeSubject.pipe(
            scan((acc, {description, value}) => {
                const next = acc + value
                log.error('scan', {description, value, next})
                return next
            }, 0),
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
