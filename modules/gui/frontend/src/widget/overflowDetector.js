import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './overflowDetector.module.css'

export default class OverflowDetector extends React.Component {
    ref = React.createRef()

    render() {
        const {className, children} = this.props
        const element = this.ref.current
        const isOverflown = () => element && element.clientHeight < element.scrollHeight
        return (
            <div ref={this.ref} className={[styles.overflow, className].join(' ')}>
                {_.isFunction(children) ? children(isOverflown) : children}
            </div>
        )
    }
}

OverflowDetector.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}
