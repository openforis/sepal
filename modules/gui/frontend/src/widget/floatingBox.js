import {ElementResizeDetector} from './elementResizeDetector'
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
    viewportDimensions: selectFrom(state, 'dimensions') || []
})

class FloatingBox extends React.Component {
    state = {
        elementDimensions: {},
        contentDimensions: {}
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
        this.onResize = this.onResize.bind(this)
    }

    render() {
        const {className, placement, alignment, children, viewportDimensions: {height: viewportHeight}, onBlur} = this.props
        const {elementDimensions: {top: elementTop, bottom: elementBottom}, contentDimensions: {width: contentWidth}} = this.state

        const {left, right} = this.getCorrectedHorizontalPosition()

        const style = {
            '--above-height': elementTop,
            '--above-bottom': viewportHeight - elementTop - 2,
            '--below-height': viewportHeight - elementBottom,
            '--below-top': elementBottom,
            '--left': left,
            '--right': right,
            '--width': contentWidth
        }

        return (
            <Portal type='global'>
                <BlurDetector className={styles.container} onBlur={onBlur}>
                    <div
                        ref={this.ref}
                        className={[styles.box, styles[placement], styles[alignment], className].join(' ')}
                        style={style}>
                        <ElementResizeDetector onResize={this.onResize}>
                            {children}
                        </ElementResizeDetector>
                    </div>
                </BlurDetector>
            </Portal>
        )
    }

    getCorrectedHorizontalPosition() {
        const {left, right} = this.getHorizontalPosition()
        const margin = 5

        const leftOverflow = Math.max(margin, left) - left
        const rightOverflow = Math.max(margin, right) - right

        if (rightOverflow && !leftOverflow) {
            return {
                left: left - rightOverflow,
                right: margin
            }
        }
        if (leftOverflow && !rightOverflow) {
            return {
                left: margin,
                right: right - leftOverflow
            }
        }
        return {
            left,
            right
        }
    }

    getHorizontalPosition() {
        const {alignment, viewportDimensions: {width: viewportWidth}} = this.props
        const {elementDimensions: {left: elementLeft, right: elementRight}, contentDimensions: {width: contentWidth}} = this.state

        const elementCenter = (elementRight + elementLeft) / 2
        
        switch (alignment) {
        case 'fit':
            return {
                left: elementLeft,
                right: viewportWidth - elementRight
            }
        case 'center':
            return {
                left: elementCenter - contentWidth / 2,
                right: viewportWidth - elementCenter - contentWidth / 2
            }
        case 'left':
            return {
                left: elementLeft,
                right: viewportWidth - elementLeft - contentWidth
            }
        case 'right':
            return {
                left: elementRight - contentWidth,
                right: viewportWidth - elementRight
            }
        }
    }

    onResize(contentDimensions) {
        this.setState({contentDimensions})
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
        this.updateState({elementDimensions: {top, bottom, left, right}})
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
    alignment: PropTypes.oneOf(['fit', 'left', 'center', 'right']),
    className: PropTypes.string,
    element: PropTypes.object,
    placement: PropTypes.oneOf(['above', 'below']),
    onBlur: PropTypes.func
}

FloatingBox.defaultProps = {
    alignment: 'left',
    placement: 'below'
}
