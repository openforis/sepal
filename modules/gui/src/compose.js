import fp from 'lodash/fp'

export const compose = (component, ...wrappers) =>
    fp.flow(wrappers)(component)

export const composeHoC = (...wrappers) =>
    fp.flow(wrappers)
