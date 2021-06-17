const {EMPTY, ReplaySubject, defer} = require('rxjs')
const {first, scan, switchMapTo, takeWhile} = require('rxjs/operators')
const log = require('sepal/log').getLogger('rxjs')

let _finalizeSubject

module.exports = {
    _addFinalize: description => {
        if (!_finalizeSubject)
            _finalizeSubject = new ReplaySubject()
        _finalizeSubject.next({description, value: 1})
    },
    _completeFinalize: description =>
        _finalizeSubject && _finalizeSubject.next({description, value: -1}),

    finalize$: defer(() => _finalizeSubject
        ? _finalizeSubject.pipe(
            scan((acc, {value}) => acc + value, 0),
            takeWhile(acc => {
                if (acc > 0) {
                    return true
                } else {
                    _finalizeSubject = null
                    log.debug('All finalize blocks completed')
                    return false
                }
            }),
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
