import {addHash} from 'hash'
import _ from 'lodash'

const deserializer = (_key, value) => {
    addHash(value)
    return value
}

export const serialize = value => {
    return JSON.stringify(value)
}

export const deserialize = value => {
    return JSON.parse(value, deserializer)
}
