import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import BlurDetector from 'widget/blurDetector'
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
        box: {}
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
    }

    render() {
        const {className, placement, alignment, autoWidth, children, dimensions: {height, width}, onBlur} = this.props
        const {box: {top, bottom, left, right}} = this.state
        const style = {
            '--left': ['center', 'left'].includes(alignment) ? left : 'auto',
            '--right': ['center', 'right'].includes(alignment) ? width - right : 'auto',
            '--width': autoWidth ? null : right - left,
            '--above-height': top,
            '--above-bottom': height - top - 2,
            '--below-height': height - bottom,
            '--below-top': bottom
        }
        return (
            <Portal type='global'>
                <BlurDetector className={styles.container} onBlur={onBlur}>
                    <div
                        ref={this.ref}
                        className={[styles.box, styles[placement], styles[alignment], className].join(' ')}
                        style={style}>
                        {children}
                    </div>
                </BlurDetector>
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
        const {top, bottom, left, right} = this.getBoundingBox()
        this.updateState({box: {top, bottom, left, right}})
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

export default compose(
    FloatingBox,
    connect(mapStateToProps),
    withForwardedRef()
)

FloatingBox.propTypes = {
    children: PropTypes.any.isRequired,
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    autoWidth: PropTypes.any,
    className: PropTypes.string,
    element: PropTypes.object,
    placement: PropTypes.oneOf(['above', 'below']),
    onBlur: PropTypes.func
}

FloatingBox.defaultProps = {
    alignment: 'left',
    placement: 'below'
}
