const {of} = require('rxjs')
const log = require('@sepal/log')

const args = ['A', 123, true]

const worker$ = (...args) => {
    log.info(`Running TestBefore with args: ${args}`)
    return of()
}

module.exports = ctx => ctx
    ? args
    : worker$
