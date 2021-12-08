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

const MARGIN = 5

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
        const {className, alignment, horizontalOverflow, element, elementBlur, children, onBlur} = this.props
        const {contentDimensions: {width}} = this.state

        const {left, right} = this.getCorrectedHorizontalPosition()
        const {top, bottom, height, placement} = this.getCorrectedVerticalPosition()

        const style = {
            '--top': top,
            '--bottom': bottom,
            '--height': height,
            '--left': left,
            '--right': right,
            '--width': width
        }

        return (
            <Portal type='global'>
                <BlurDetector
                    onBlur={onBlur}
                    exclude={elementBlur ? null : element}
                    ref={this.ref}
                    className={[
                        styles.box,
                        styles[placement],
                        styles[alignment],
                        horizontalOverflow ? styles.horizontalOverflow : null,
                        className
                    ].join(' ')}
                    style={style}>
                    {children}
                </BlurDetector>
            </Portal>
        )
    }

    getPlacement() {
        const {placement} = this.props
        switch (placement) {
        case 'above-below':
            return {preferred: 'above', alternate: 'below'}
        case 'below-above':
            return {preferred: 'below', alternate: 'above'}
        default:
            return {preferred: placement}
        }
    }

    getCorrectedVerticalPosition() {
        const {preferred, alternate} = this.getPlacement()
        const {top, bottom, height, placement} = this.getVerticalPosition(preferred)
        
        const topOverflow = Math.max(MARGIN, top) - top
        const bottomOverflow = Math.max(MARGIN, bottom) - bottom

        if (alternate && (topOverflow || bottomOverflow)) {
            return this.getVerticalPosition(alternate)
        }

        return {top, bottom, height, placement}
    }

    getVerticalPosition(placement) {
        const {viewportDimensions: {height: viewportHeight}} = this.props
        const {elementDimensions: {top: elementTop, bottom: elementBottom}, contentDimensions: {height: contentHeight}} = this.state

        if (placement === 'above') {
            return {
                top: elementTop - contentHeight,
                bottom: viewportHeight - elementTop,
                height: elementTop,
                placement
            }
        }
        if (placement === 'below') {
            return {
                top: elementBottom,
                bottom: viewportHeight - elementBottom - contentHeight,
                height: viewportHeight - elementBottom,
                placement
            }
        }
    }

    getCorrectedHorizontalPosition() {
        const {left, right} = this.getHorizontalPosition()

        const leftOverflow = Math.max(MARGIN, left) - left
        const rightOverflow = Math.max(MARGIN, right) - right

        if (rightOverflow && !leftOverflow) {
            return {
                left: left - rightOverflow,
                right: MARGIN
            }
        }
        if (leftOverflow && !rightOverflow) {
            return {
                left: MARGIN,
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
        const elementDimensions = this.getElementDimensions()
        const contentDimensions = this.getContentDimensions()
        this.updateState({elementDimensions, contentDimensions})
    }

    getElementDimensions() {
        const {element} = this.props
        return this.getDimensions(element)
    }

    getContentDimensions() {
        const {ref} = this
        return this.getDimensions(ref.current)
    }

    getDimensions(element) {
        if (element) {
            const {top, bottom, left, right} = element.getBoundingClientRect()
            const width = right - left
            const height = bottom - top
            return {
                top: Math.round(top),
                bottom: Math.round(bottom),
                left: Math.round(left),
                right: Math.round(right),
                width: Math.round(width),
                height: Math.round(height)
            }
        }
        return {}
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
    elementBlur: PropTypes.any,
    horizontalOverflow: PropTypes.any,
    placement: PropTypes.oneOf(['above', 'below', 'above-below', 'below-above']),
    onBlur: PropTypes.func
}

FloatingBox.defaultProps = {
    alignment: 'left',
    placement: 'below',
    horizontalOverflow: false,
    elementBlur: false
}
