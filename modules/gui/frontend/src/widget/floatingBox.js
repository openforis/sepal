import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './floatingBox.module.css'
import withForwardedRef from 'ref'

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class FloatingBox extends React.Component {
    state = {
        dimensions: {}
    }

    render() {
        const {className, placement, width, forwardedRef, children} = this.props
        const {dimensions: {height, top, bottom, left, right}} = this.state
        const style = {
            '--left': left,
            '--width': width === 'element' ? right - left : null,
            '--above-height': top,
            '--above-bottom': height - top - 2,
            '--below-height': height - bottom,
            '--below-top': bottom
        }
        return (
            <Portal type='global'>
                <div
                    ref={forwardedRef}
                    className={[styles.box, styles[placement], className].join(' ')}
                    style={style}>
                    {children}
                </div>
            </Portal>
        )
    }

    updateState(state, callback) {
        const updatedState = (prevState, state) =>
            _.isEqual(_.pick(prevState, _.keys(state)), state) ? null : state
        this.setState(
            prevState =>
                updatedState(prevState, _.isFunction(state) ? state(prevState) : state),
            callback
        )
    }

    updateDimensions() {
        const {dimensions: {height}} = this.props
        const {top, bottom, left, right} = this.getBoundingBox()
        this.updateState({dimensions: {height, top, bottom, left, right}})
    }

    getBoundingBox() {
        const {element} = this.props
        return element
            ? element.getBoundingClientRect()
            : {}
    }

    componentDidMount() {
        this.updateDimensions()
    }

    componentDidUpdate() {
        this.updateDimensions()
    }
}

export default (
    withForwardedRef(
        connect(mapStateToProps)(
            FloatingBox
        )
    )
)

FloatingBox.propTypes = {
    children: PropTypes.object.isRequired,
    className: PropTypes.string,
    element: PropTypes.object,
    placement: PropTypes.oneOf(['above', 'below']),
    width: PropTypes.oneOf(['element', 'auto'])
}

FloatingBox.defaultProps = {
    placement: 'below',
    width: 'element'
}
