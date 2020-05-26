const {ReplaySubject} = require('rxjs')
const {first} = require('rxjs/operators')

module.exports = {
    fromPromise: promise => {
        const $ = new ReplaySubject()
        promise
            .then(value => $.next(value))
            .catch(error => $.error(error))
        return $.pipe(first())
    }
}