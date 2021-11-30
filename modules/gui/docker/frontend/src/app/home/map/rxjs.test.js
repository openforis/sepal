const stream = (name, streamFn$, fn, errorFn) =>
    test(name, done => {
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
                if (errorFn)
                    expect(false, 'Expected an error to be thrown.').toBe(true)
                done()
            }
        )
    })

const emitsNothing = () =>
    emitted =>
        expect(emitted.length, `Expected that no value were emitted, got ${emitted.length} instead`).toBe(0)

const emitsOne = fn =>
    emitted => {
        expect(emitted.length, `Expected a single value to be emitted, got ${emitted.length} instead`).toBe(1)
        fn && fn(emitted[0])
    }

const throwsError = fn =>
    error => fn && fn(error)

module.exports = {stream, emitsNothing, emitsOne, throwsError}
