const {ReplaySubject} = require('rx')
const {first} = require('rx/operators')

const {finalize$} = require('./finalize')

const promise$ = callback => {
    const $ = new ReplaySubject()
    const resolve = value => $.next(value)
    const reject = error => $.error(error)
    try {
        callback(resolve, reject)
    } catch (error) {
        reject(error)
    }
    return $.pipe(first())
}

const fromPromise = promise => {
    const $ = new ReplaySubject()
    promise
        .then(value => $.next(value))
        .catch(error => $.error(error))
    return $.pipe(first())
}

module.exports = {
    promise$,
    fromPromise,
    finalize$
}
