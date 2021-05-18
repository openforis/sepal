import {normalize} from 'app/home/map/visParams/visParams'
import _ from 'lodash'

export const toVisualizations = properties =>
    _.chain(properties)
        .keys()
        .map(key => {
            const match = key.match(/^visualization_(\d+)_(.*)/)
            return match
                ? {i: match[1], key: match[2], value: properties[match[0]]}
                : null
        })
        .filter(match => match)
        .groupBy('i')
        .sortBy('i')
        .values()
        .map(props => {
            const visParams = {}
            props.forEach(({key, value}) => visParams[key] = value)
            return normalize(visParams)
        })
        .value()
