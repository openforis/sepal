import _ from 'lodash'

export const applyDefaults = (defaults, ...src) => {
    const objs = _.map(src,
        obj => _.pickBy(obj, prop => !_.isNil(prop))
    )
    return _.merge(_.cloneDeep(defaults), ...objs)
}
