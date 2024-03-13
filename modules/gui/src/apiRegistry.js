import _ from 'lodash'

const registry = {}

export const setApi = api =>
    _.assign(registry, api)

export default registry
