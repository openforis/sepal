import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

export class FormContainer extends React.Component {
    constructor() {
        super()
        this.onSubmit = this.onSubmit.bind(this)
    }

    render() {
        const {className, children} = this.props
        return (
            <form
                className={className}
                onSubmit={this.onSubmit}>
                {children}
            </form>
        )
    }

    onSubmit(e) {
        const {onSubmit} = this.props
        e.preventDefault()
        onSubmit && onSubmit(e)
    }
}

FormContainer.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    onSubmit: PropTypes.func
}
