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
        console.log('active', this.props.active)
        if (this.props.active) {
            this.hasBeenActive = true
            this.className = props.classNames.in
        }
    }

    componentWillReceiveProps(nextProps) {
        if (this.props.active && !nextProps.active) {
            this.className = this.props.classNames.out
            console.log('out', document.activeElement, document.activeElement && document.activeElement.id)
            this.activeElement = document.activeElement
        }
        if (!this.props.active && nextProps.active) {
            this.className = this.props.classNames.in
            this.hasBeenActive = true
            this.activeElement && this.context.focus(this.activeElement)
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