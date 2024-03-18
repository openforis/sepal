const registry = {}

export const setApi = api =>
    Object.assign(registry, api)

export default registry
