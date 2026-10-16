export const callsOf = fn => fn.mock.calls.map(({arguments: args}) => args)
