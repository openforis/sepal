export const composeHoC = (...wrappers) =>
    component => wrappers.reduce((acc, wrapper) => wrapper(acc), component)

export const compose = (component, ...wrappers) =>
    wrappers.reduce((acc, wrapper) => wrapper(acc), component)
