import {msg} from 'translate'
import _ from 'lodash'
import moment from 'moment'

class FormProperty {
    static _EMAIL_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/ // eslint-disable-line no-useless-escape

    _predicates = []
    _skip = []

    skip(when) {
        this._skip.push(when)
        return this
    }

    predicate(constraint, messageId, messageArgs = () => ({})) {
        this._predicates.push([constraint, messageId, messageArgs])
        return this
    }

    match(regex, messageId, messageArgs) {
        return this.predicate(
            value => isBlank(value) || regex.test(value),
            messageId || 'fieldValidation.match',
            messageId ? messageArgs : () => ({regex})
        )
    }

    notEmpty(messageId = 'fieldValidation.notEmpty', messageArgs) {
        return this.predicate(value => {
            if (Array.isArray(value))
                return value.length > 0
            else if (value === Object(value))
                return Object.keys(value).length > 0
            else
                return !isBlank(value)
        },
        messageId,
        messageArgs
        )
    }

    notBlank(messageId = 'fieldValidation.notBlank', messageArgs) {
        return this.predicate(value => !isBlank(value), messageId, messageArgs)
    }

    notNil(messageId = 'fieldValidation.notNil', messageArgs) {
        return this.predicate(value => !_.isNil(value), messageId, messageArgs)
    }

    email(messageId = 'fieldValidation.email', messageArgs) {
        return this.match(FormConstraint._EMAIL_REGEX, messageId, messageArgs)
    }

    date(format, messageId = 'fieldValidation.date', messageArgs) {
        return this.predicate(value => isBlank(value) || moment(value, format).isValid(), messageId, messageArgs)
    }

    int(messageId = 'fieldValidation.int', messageArgs) {
        return this.predicate(value => isBlank(value) || String(value).match(/^\d+$/), messageId, messageArgs)
    }

    number(messageId = 'fieldValidation.number', messageArgs) {
        return this.predicate(
            value => isBlank(value) || _.isFinite(value) || (!isNaN(value) && !isNaN(parseFloat(value))),
            messageId,
            messageArgs
        )
    }

    min(minValue, messageId, messageArgs) {
        return this.predicate(
            value => isBlank(value) || value >= minValue,
            messageId || 'fieldValidation.min',
            messageId ? messageArgs : () => ({minValue})
        )
    }

    greaterThan(minValue, messageId, messageArgs) {
        return this.predicate(
            value => isBlank(value) || value > minValue,
            messageId || 'fieldValidation.greaterThan',
            messageId ? messageArgs : () => ({minValue})
        )
    }

    max(maxValue, messageId, messageArgs) {
        return this.predicate(
            value => isBlank(value) || value <= maxValue,
            messageId || 'fieldValidation.max',
            messageId ? messageArgs : () => ({maxValue})
        )
    }

    lessThan(maxValue, messageId, messageArgs) {
        return this.predicate(
            value => isBlank(value) || value < maxValue,
            messageId || 'fieldValidation.lessThan',
            messageId ? messageArgs : () => ({maxValue})
        )
    }

    check(name, values) {
        const skip = this.isSkipped(name, values)
        const failingConstraint = !skip &&
            this._predicates.find(constraint =>
                this._checkPredicate(name, values, constraint[0]) ? null : constraint[1]
            )
        return failingConstraint ? msg(failingConstraint[1], failingConstraint[2](values)) : ''
    }

    _checkPredicate(_name, _values, _predicate) {
        throw Error('Expected to be implemented by subclass')
    }

    isSkipped(_name, _values) {
        throw Error('Expected to be implemented by subclass')
    }
}

export class FormConstraint extends FormProperty {
    constructor(fieldNames) {
        super()
        this.fieldNames = fieldNames
        if (!Array.isArray(fieldNames) || fieldNames.length < 2)
            throw Error('Constructor of Constraint requires an array of at least 2 field names')
    }

    _checkPredicate(name, values, predicate) {
        return predicate(values)
    }

    isSkipped(name, values) {
        return this._skip.find(when => when(values))
    }
}

export class FormField extends FormProperty {
    _checkPredicate(name, values, predicate) {
        return predicate(values[name], values)
    }

    isSkipped(name, values) {
        return this._skip.find(when => when(values[name], values))
    }
}

const isBlank = value => _.isEmpty(value) && !_.isNumber(value) && isNaN(parseFloat(value))
