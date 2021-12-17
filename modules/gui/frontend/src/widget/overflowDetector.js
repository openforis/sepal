import PropTypes from 'prop-types'
import React from 'react'
import styles from './overflowDetector.module.css'

export default class OverflowDetector extends React.Component {
    ref = React.createRef()

    render() {
        const {className, children} = this.props
        const element = this.ref.current
        const isOverflown = direction =>
            direction === 'x'
                ? element && element.clientWidth < element.scrollWidth
                : element && element.clientHeight < element.scrollHeight
        return (
            <div ref={this.ref} className={[styles.overflow, className].join(' ')}>
                {children(isOverflown)}
            </div>
        )
    }
}

OverflowDetector.propTypes = {
    children: PropTypes.func.isRequired,
    className: PropTypes.string,
    direction: PropTypes.oneOf(['x', 'y'])
}

OverflowDetector.defaultProps = {
    direction: 'y'
}
