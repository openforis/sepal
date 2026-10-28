import assert from 'node:assert/strict'
import {test} from 'node:test'

const stream = (name, streamFn$, fn, errorFn) =>
    test(name, (_t, done) => {
        const values = []
        streamFn$().subscribe(
            next => values.push(next),
            error => {
                if (errorFn) {
                    errorFn(error)
                    fn(values)
                    done()
                } else {
                    done(error)
                }
            },
            () => {
                fn(values)
                done(errorFn ? new Error('Expected an error to be thrown.') : undefined)
            }
        )
    })

const emitsNothing = () =>
    emitted =>
        assert.equal(emitted.length, 0, `Expected that no value were emitted, got ${emitted.length} instead`)

const emitsOne = fn =>
    emitted => {
        assert.equal(emitted.length, 1, `Expected a single value to be emitted, got ${emitted.length} instead`)
        fn && fn(emitted[0])
    }

const throwsError = fn =>
    error => fn && fn(error)

export {emitsNothing, emitsOne, stream, throwsError}
