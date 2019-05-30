import {add, remove} from './keybindings'
import {compose} from 'compose'
import {connect} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

class Keybinding extends React.Component {
    constructor(props) {
        super(props)
        this.createKeybinding()
        const {onEnable, onDisable} = props
        onEnable(() => this.keybinding.enabled = true)
        onDisable(() => this.keybinding.enabled = false)
    }

    createKeybinding() {
        const {disabled, priority} = this.props
        this.keybinding = {
            disabled,
            priority,
            enabled: true,
            handler: this.handle.bind(this),
            handles: key => _.keys(this.props.keymap).includes(key)
        }
    }

    getDefaultHandler() {
        const {keymap} = this.props
        return keymap.default
    }

    getCustomHandler(key) {
        const {keymap} = this.props
        return keymap[key]
    }

    getHandler(key) {
        return this.getCustomHandler(key) || this.getDefaultHandler()
    }

    handle(event, key) {
        const handler = this.getHandler(key)
        if (handler) {
            handler(event)
            event.preventDefault()
        }
    }

    render() {
        const {children} = this.props
        return children || null
    }

    componentDidMount() {
        add(this.keybinding)
    }

    componentDidUpdate() {
        const {disabled, priority} = this.props
        this.keybinding.disabled = disabled
        this.keybinding.priority = priority

    }

    componentWillUnmount() {
        remove(this.keybinding)
    }
}

export default compose(
    Keybinding,
    connect()
)

Keybinding.propTypes = {
    disabled: PropTypes.any,
    keymap: PropTypes.object,
    priority: PropTypes.any
}
