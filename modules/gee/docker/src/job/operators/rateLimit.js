const {Subject} = require('rxjs')
const {mergeMap} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const {ports: {rateLimit}} = require('../worker')

module.exports = () =>
    observable$ => observable$.pipe(
        mergeMap(value => {
            const id = uuid()
            const observable$ = new Subject()
            const listener = message => {
                if (message === id) {
                    rateLimit.removeListener('message', listener)
                    observable$.next(value)
                    observable$.complete()
                }
            }
            rateLimit.on('message', listener)
            rateLimit.postMessage(id)
            return observable$
        })
    )
