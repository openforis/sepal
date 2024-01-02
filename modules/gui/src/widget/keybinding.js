import {compose} from 'compose'
import {connect} from 'store'
import {fromEvent} from 'rxjs'
import {withEnableDetector} from 'enabled'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const keybindings = []

const getCandidateKeybindings = key =>
    _.filter(keybindings,
        keybinding => !keybinding.disabled && keybinding.enabled && keybinding.handles(key)
    )

const getClosestKeybinding = keybindings =>
    _.first(keybindings)

const handle = (keybindings, event, key) => {
    const keybinding = getClosestKeybinding(keybindings)
    const handler = keybinding && keybinding.handler
    if (handler) {
        const handover = handler(event, key) === false
        if (handover) {
            const remainingKeybindings = _.without(keybindings, keybinding)
            if (remainingKeybindings.length) {
                handle(remainingKeybindings, event, key)
            }
        }
    }
}

const handleEvent = event => {
    const eventKey = [
        {key: 'Ctrl', value: event.ctrlKey},
        {key: 'Alt', value: event.altKey},
        {key: 'Shift', value: event.shiftKey},
        {key: 'Meta', value: event.metaKey}]
        .filter(({value}) => value)
        .map(({key}) => key)
        .concat([event.key])
        .join('+')
    handle(getCandidateKeybindings(eventKey), event, eventKey)
}

fromEvent(document, 'keydown').subscribe(
    event => handleEvent(event)
)

const add = keybinding =>
    keybindings.unshift(keybinding)

const remove = keybinding =>
    _.pull(keybindings, keybinding)

class Keybinding extends React.Component {
    constructor(props) {
        super(props)
        this.handlesKey = this.handlesKey.bind(this)
        this.createKeybinding()
        const {enableDetector: {onChange: onEnableChange}} = props
        onEnableChange(enabled => this.keybinding.enabled = enabled)
        add(this.keybinding)
    }

    createKeybinding() {
        const {disabled} = this.props
        this.keybinding = {
            disabled,
            enabled: true,
            handler: this.handle.bind(this),
            handles: this.handlesKey
        }
    }

    handlesKey(key) {
        const {keymap} = this.props
        return keymap && _.keys(keymap).includes(key)
        // return keymap && keymap[key] // this doesn't work
    }

    getDefaultHandler() {
        const {keymap} = this.props
        return keymap && keymap.default
    }

    getCustomHandler(key) {
        const {keymap} = this.props
        return keymap && keymap[key]
    }

    getHandler(key) {
        return this.getCustomHandler(key) || this.getDefaultHandler()
    }

    handle(event, key) {
        const handler = this.getHandler(key)
        if (handler) {
            event.preventDefault()
            return handler(event)
        }
    }

    render() {
        const {children} = this.props
        return children || null
    }

    componentDidUpdate() {
        const {disabled} = this.props
        this.keybinding.disabled = disabled

    }

    componentWillUnmount() {
        remove(this.keybinding)
    }
}

export default compose(
    Keybinding,
    connect(),
    withEnableDetector()
)

Keybinding.propTypes = {
    disabled: PropTypes.any,
    keymap: PropTypes.object
}
