import React from 'react'
import PropTypes from 'prop-types'

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

    componentWillReceiveProps(nextProps) {
        if (this.props.active && !nextProps.active) {
            this.className = this.props.classNames.out
            this.active = false
            this.activeElement = document.activeElement
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
        return (
            <div className={[this.props.classNames.default, this.className].join(' ')}>
                {this.hasBeenActive ? this.props.children : null}
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