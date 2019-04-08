import {fromEvent} from 'rxjs'
import {v4 as uuid} from 'uuid'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

export default class Keybinding extends React.Component {
    id = uuid()
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

    pushInstance() {
        Keybinding.instances.push(this.id)
    }

    popInstance() {
        Keybinding.instances = _.pull(Keybinding.instances, this.id)
    }

    isActiveInstance() {
        return _.last(Keybinding.instances) === this.id
    }

    componentDidMount() {
        this.pushInstance()
        const keypress$ = fromEvent(document, 'keydown')
        this.subscriptions.push(
            keypress$.subscribe(
                event => this.isActiveInstance() && this.keyHandler(event.key)
            )
        )
    }

    componentWillUnmount() {
        this.popInstance()
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }
}

Keybinding.propTypes = {
    onEnter: PropTypes.func,
    onEscape: PropTypes.func
}
