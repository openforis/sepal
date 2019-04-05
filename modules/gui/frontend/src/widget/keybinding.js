import {fromEvent} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'

export default class Keybinding extends React.Component {
    subscriptions = []

    static instances = []

    render() {
        const {children} = this.props
        return children
    }

    handleEscape() {
        const blurrableElements = ['INPUT', 'SELECT']
        if (blurrableElements.includes(document.activeElement.tagName)) {
            document.activeElement.blur()
        } else {
            const {onEscape} = this.props
            onEscape && onEscape()
        }
    }

    handleEnter() {
        const {onEnter} = this.props
        onEnter && onEnter()
    }

    keyHandler(key) {
        switch (key) {
        case 'Escape':
            return this.handleEscape()
        case 'Enter':
            return this.handleEnter()
        default:
        }
    }

    pushActiveInstance() {
        Keybinding.instances.unshift(this)
    }

    popActiveInstance() {
        Keybinding.instances.shift()
    }

    isActiveInstance() {
        return Keybinding.instances[0] === this
    }

    componentDidMount() {
        this.pushActiveInstance()
        const keypress$ = fromEvent(document, 'keydown')
        this.subscriptions.push(
            keypress$.subscribe(
                event => this.isActiveInstance() && this.keyHandler(event.key)
            )
        )
    }

    componentWillUnmount() {
        this.popActiveInstance()
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }
}

Keybinding.propTypes = {
    onEnter: PropTypes.func,
    onEscape: PropTypes.func
}
