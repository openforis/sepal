import {connect} from 'store'
import {fromEvent} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const keybindings = []

const getHandler = key => {
    const candidateKeybindings = _.filter(keybindings,
        keybinding => !keybinding.disabled && keybinding.enabled && keybinding.handles(key)
    )
    if (candidateKeybindings.length) {
        const priorityKeybinding = _.find(candidateKeybindings, keybinding => keybinding.priority)
        if (priorityKeybinding) {
            return priorityKeybinding.handler
        }
        return _.first(candidateKeybindings).handler
    }
}

const handleEvent = event => {
    const key = [
        {key: 'Ctrl', value: event.ctrlKey},
        {key: 'Alt', value: event.altKey},
        {key: 'Shift', value: event.shiftKey},
        {key: 'Meta', value: event.metaKey}]
        .filter(({value}) => value)
        .map(({key}) => key)
        .concat([event.key])
        .join('+')
    const handler = getHandler(key)
    if (handler) {
        handler(event, key)
    }
}

fromEvent(document, 'keydown')
    .subscribe(
        event => handleEvent(event)
    )

class Keybinding extends React.Component {
    keybinding = null

    constructor(props) {
        super(props)
        const {disabled, priority, onEnable, onDisable} = props
        this.keybinding = {
            disabled,
            priority,
            enabled: true,
            handler: this.handle.bind(this),
            handles: key => _.keys(this.props.keymap).includes(key)
        }
        onEnable(() => this.keybinding.enabled = true)
        onDisable(() => this.keybinding.enabled = false)
    }

    getDefaultHandler() {
        const {keymap} = this.props
        return keymap.default
    }

    getHandler(key) {
        const {keymap} = this.props
        const handler = keymap[key]
        return handler || this.getDefaultHandler()
    }

    handle(event, key) {
        const handler = this.getHandler(key)
        if (handler) {
            handler(event)
            event.preventDefault()
        }
    }

    addHandler() {
        keybindings.unshift(this.keybinding)
    }

    removeHandler() {
        _.pull(keybindings, this.keybinding)
    }

    render() {
        const {children} = this.props
        return children || null
    }

    componentDidMount() {
        this.addHandler()
    }

    componentDidUpdate() {
        const {disabled, priority} = this.props
        this.keybinding.disabled = disabled
        this.keybinding.priority = priority

    }

    componentWillUnmount() {
        this.removeHandler()
    }
}

export default connect()(
    Keybinding
)

Keybinding.propTypes = {
    disabled: PropTypes.any,
    keymap: PropTypes.object,
    priority: PropTypes.any
}
