import fp from 'lodash/fp'

export const compose = (component, ...wrappers) =>
    fp.compose(fp.reverse(wrappers))(component)
