import {connect} from 'store'
import {fromEvent} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const keybindings = (() => {
    const keybindings = []

    const getCandidateKeybindings = key =>
        _.filter(keybindings,
            keybinding => !keybinding.disabled && keybinding.enabled && keybinding.handles(key)
        )

    const getPriorityKeybinding = keybindings =>
        _.find(keybindings, keybinding => keybinding.priority)
    
    const getDefaultKeybinding = keybindings =>
        _.first(keybindings)

    const getKeybinding = keybindings =>
        getPriorityKeybinding(keybindings) || getDefaultKeybinding(keybindings)

    const getHandler = key => {
        const candidateKeybindings = getCandidateKeybindings(key)
        const keybinding = getKeybinding(candidateKeybindings)
        return keybinding && keybinding.handler
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

    const add = keybinding =>
        keybindings.unshift(keybinding)

    const remove = keybinding =>
        _.pull(keybindings, keybinding)

    fromEvent(document, 'keydown')
        .subscribe(
            event => handleEvent(event)
        )
    
    return {add, remove}
})()

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
        keybindings.add(this.keybinding)
    }

    componentDidUpdate() {
        const {disabled, priority} = this.props
        this.keybinding.disabled = disabled
        this.keybinding.priority = priority

    }

    componentWillUnmount() {
        keybindings.remove(this.keybinding)
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
