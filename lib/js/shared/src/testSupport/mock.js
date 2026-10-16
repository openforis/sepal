export const callsOf = fn => fn.mock.calls.map(({arguments: args}) => args)

// The implementations answer successive calls in turn; once they run out, `otherwise` answers.
export const inSequence = (implementations, otherwise = () => undefined) => {
    const pending = [...implementations]
    return (...args) => (pending.shift() ?? otherwise)(...args)
}
