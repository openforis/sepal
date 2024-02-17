import _ from 'lodash'

export const applyDefaults = (defaults, ...src) =>
    _.merge(_.cloneDeep(defaults), ...src)
