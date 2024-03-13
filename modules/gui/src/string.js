import _ from 'lodash'

const _trim = s => s.trim()

const _removePunctuation = s => s.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')

const _removeNonAlphanumeric = s => s.replace(/[^0-9a-zA-Z\s]/g, '')

const _removeAccents = s => s.replace(/[\u0300-\u036f]/g, '')

const _removeRepeatedSpaces = s => s.replace(/\s{2,}/g, ' ')

export const simplifyString = (s, {trim = true, removeAccents = true, removePunctuation = false, removeNonAlphanumeric = true, removeRepeatedSpaces = true} = {}) => {
    if (!_.isString(s)) {
        return s
    }
    const replacers = _.compact([
        trim ? _trim : null,
        removeAccents ? _removeAccents : null,
        removePunctuation ? _removePunctuation : null,
        removeNonAlphanumeric ? _removeNonAlphanumeric : null,
        removeRepeatedSpaces ? _removeRepeatedSpaces : null
    ])
    return replacers.reduce((s, replacer) => replacer(s), removeAccents ? s.normalize('NFD') : s)
}

export const splitString = s => s ? s.split(/\s+/) : []

export const toSafeString = s =>
    s
        ? simplifyString(s, {
            removeNonAlphanumeric: false,
            removePunctuation: false
        }).replace(/[^\w-.]/g, '_')
        : s

export const escapeRegExp = string =>
    string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
