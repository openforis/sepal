const {of} = require('rxjs')
const log = require('../log')

const args = ['A', 456, true]

const worker$ = (...args) => {
    log.info(`Running TestBefore with args: ${args}`)
    return of()
}

module.exports = ctx => ctx
    ? args
    : worker$
