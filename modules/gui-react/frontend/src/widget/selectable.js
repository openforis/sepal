import React from 'react'
import PropTypes from 'prop-types'

export class Select extends React.Component {
    getChildContext() {
        const focus = (element) => this.elementToFocus = element
        focus.bind(this)
        return {
            focus: focus
        }
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
        if (this.props.active) {
            this.className = props.classNames.in
        }
    }

    componentWillReceiveProps(nextProps) {
        if (this.props.active && !nextProps.active) {
            this.className = this.props.classNames.out
            this.activeElement = document.activeElement
        }
        if (!this.props.active && nextProps.active) {
            this.className = this.props.classNames.in
            this.activeElement && this.context.focus(this.activeElement)
        }
    }

    render() {
        return (
            <div className={[this.props.classNames.default, this.className].join(' ')}>
                {this.props.children}
            </div>
        )
    }
}

Selectable.contextTypes = {
    focus: PropTypes.func
}