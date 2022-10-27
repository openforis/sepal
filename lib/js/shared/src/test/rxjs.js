const stream = (name, streamFn$, fn, errorFn) =>
    test(name, done => {
        const values = []
        const handleError = error => {
            try {
                if (errorFn) {
                    errorFn(error)
                    fn(values)
                    done()
                } else {
                    done(error)
                }
            } catch(error) {
                done(error)
            }
        }
        try {
            const stream$ = typeof streamFn$ === 'function'
                ? streamFn$()
                : streamFn$
            stream$.subscribe(
                next => values.push(next),
                handleError,
                () => {
                    try {
                        fn(values)
                        if (errorFn)
                            expect(false, 'Expected an error to be thrown.').toBe(true)
                        done()
                    } catch(error) {
                        done(error)
                    }
                }
            )
        } catch(error) {
            handleError(error)
        }
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
