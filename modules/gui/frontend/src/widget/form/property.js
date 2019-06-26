import {msg} from 'translate'
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
        return this.predicate(value => regex.test(value), messageId, messageArgs)
    }

    notEmpty(messageId, messageArgs) {
        return this.predicate(value => {
            if (Array.isArray(value))
                return value.length > 0
            else if (value === Object(value))
                return Object.keys(value).length > 0
            else
                return !!value
        },
        messageId,
        messageArgs
        )
    }

    notBlank(messageId, messageArgs) {
        return this.predicate(value => !!value, messageId, messageArgs)
    }

    email(messageId, messageArgs) {
        return this.match(FormConstraint._EMAIL_REGEX, messageId, messageArgs)
    }

    date(format, messageId, messageArgs) {
        return this.predicate(value => moment(value, format).isValid(), messageId, messageArgs)
    }

    int(messageId, messageArgs) {
        return this.predicate(value => String(value).match(/^\d+$/), messageId, messageArgs)
    }

    min(minValue, messageId, messageArgs) {
        return this.predicate(value => value >= minValue, messageId, messageArgs)
    }

    check(name, values) {
        const skip = this._isSkipped(name, values)
        const failingConstraint = !skip &&
            this._predicates.find(constraint =>
                this._checkPredicate(name, values, constraint[0]) ? null : constraint[1]
            )
        return failingConstraint ? msg(failingConstraint[1], failingConstraint[2](values)) : ''
    }

    _checkPredicate(_name, _values, _predicate) {
        throw Error('Expected to be implemented by subclass')
    }

    _isSkipped(_name, _values) {
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

    _isSkipped(name, values) {
        return this._skip.find(when => when(values))
    }
}

export class FormField extends FormProperty {
    _checkPredicate(name, values, predicate) {
        return predicate(values[name], values)
    }

    _isSkipped(name, values) {
        return this._skip.find(when => when(values[name], values))
    }
}
