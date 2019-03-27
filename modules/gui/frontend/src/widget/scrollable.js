import {disableBodyScroll, enableBodyScroll} from 'body-scroll-lock'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import flexy from './flexy.module.css'
import styles from './scrollable.module.css'

export const ScrollableContainer = ({className, children}) => {
    return (
        <div className={[flexy.container, className].join(' ')}>
            {children}
        </div>
    )
}

ScrollableContainer.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const Unscrollable = ({className, children}) => {
    return (
        <div className={[flexy.rigid, className].join(' ')}>
            {children}
        </div>
    )
}

Unscrollable.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}

export class Scrollable extends Component {
    targetRef = React.createRef()

    render() {
        const {className, direction, children} = this.props
        return (
            <div ref={this.targetRef} className={[flexy.elastic, styles.scrollable, styles[direction], className].join(' ')}>
                {children}
            </div>
        )
    }

    componentDidMount() {
        disableBodyScroll(this.targetRef.current)
    }

    componentWillUnmount() {
        enableBodyScroll(this.targetRef.current)
    }
}

Scrollable.defaultProps = {direction: 'y'}

Scrollable.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    direction: PropTypes.oneOf(['x', 'y', 'xy'])
}
