import {Enabled} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './selectable.module.css'

export class Select extends React.Component {
    getChildContext() {
        const focus = (element) => this.elementToFocus = element
        return {focus: focus.bind(this)}
    }

    render() {
        return (
            <div className={this.props.className}>
                {this.props.children}
            </div>
        )
    }

    componentDidUpdate() {
        this.elementToFocus && this.elementToFocus.focus()
    }
}

Select.childContextTypes = {
    focus: PropTypes.func
}

Select.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}

export class Selectable extends React.Component {
    constructor(props) {
        super(props)
        this.active = false
        if (this.props.active) {
            this.hasBeenActive = true
            this.active = true
            this.className = props.classNames.in
        }
    }

    getChildContext() {
        return {active: this.active}
    }

    UNSAFE_componentWillReceiveProps(nextProps) {
        if (this.props.active && !nextProps.active) {
            this.className = this.props.classNames.out
            this.active = false

            this.activeElement = document.activeElement.tagName === 'IFRAME'
                ? document.activeElement.contentWindow.document.activeElement
                : document.activeElement
        } else if (!this.props.active && nextProps.active) {
            this.className = this.props.classNames.in
            this.hasBeenActive = true
            this.active = true
            this.activeElement && this.context.focus(this.activeElement)
        } else {
            this.active = false
        }
    }

    render() {
        const {active, classNames, captureMouseEvents} = this.props
        if (!this.hasBeenActive)
            return null
        else
        // A selectable is not unmounted when deactivated to allow for animated transitions.
        // <Enabled/> is used to disconnect deactivated selectable from the Redux store.
            return (
                <div className={[
                    active && captureMouseEvents ? styles.captureMouseEvents : null,
                    classNames.default,
                    this.className
                ].join(' ')}>
                    <Enabled value={this.props.active}>
                        {this.props.children}
                    </Enabled>
                </div>
            )
    }
}

Selectable.contextTypes = {
    focus: PropTypes.func
}

Selectable.childContextTypes = {
    active: PropTypes.bool
}

Selectable.propTypes = {
    active: PropTypes.bool,
    captureMouseEvents: PropTypes.any,
    children: PropTypes.any,
    classNames: PropTypes.objectOf(PropTypes.string)
}
