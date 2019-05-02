import {fromEvent} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const handlers = []

fromEvent(document, 'keydown')
    .subscribe(
        event => _.find([...handlers], handler => handler(event))
    )

export default class Keybinding extends React.Component {
    handler = null

    constructor(props) {
        super(props)
        this.handler = this.getHandler.bind(this)
    }

    getHandler(event) {
        const {keymap, disabled} = this.props
        if (!disabled) {
            const key = [
                {key: 'Ctrl', value: event.ctrlKey},
                {key: 'Alt', value: event.altKey},
                {key: 'Shift', value: event.shiftKey},
                {key: 'Meta', value: event.metaKey}]
                .filter(({value}) => value)
                .map(({key}) => key)
                .concat([event.key])
                .join('+')
            const handler = keymap[key]
            if (handler) {
                handler(event)
                event.preventDefault()
                return true
            } else if (keymap.default) {
                keymap.default(event)
                event.preventDefault()
                return true
            }
        }
        return false
    }

    addHandler() {
        handlers.unshift(this.handler)
    }

    removeHandler() {
        _.pull(handlers, this.handler)
    }

    render() {
        const {children} = this.props
        return children || null
    }

    componentDidMount() {
        this.addHandler()
    }

    componentWillUnmount() {
        this.removeHandler()
    }
}

Keybinding.propTypes = {
    disabled: PropTypes.any,
    keymap: PropTypes.object
}
