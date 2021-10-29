import _ from 'lodash'

export const simplifyString = s => _.isString(s)
    ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : s
