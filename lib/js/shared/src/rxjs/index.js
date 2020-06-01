const {ReplaySubject} = require('rxjs')
const {first} = require('rxjs/operators')

module.exports = {
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
