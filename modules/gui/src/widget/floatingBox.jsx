import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {withContext} from '~/context'
import {withForwardedRef} from '~/ref'
import {selectFrom} from '~/stateUtils'
import {BlurDetector} from '~/widget/blurDetector'
import {Portal} from '~/widget/portal'

import styles from './floatingBox.module.css'

const MARGIN = 5
const VERTICAL_PRIORITY_MIN_PX = 150

const Context = React.createContext()

const withFloatingBox = withContext(Context, 'floatingBox')

const mapStateToProps = state => ({
    viewportDimensions: selectFrom(state, 'dimensions') || []
})

class _FloatingBox extends React.Component {
    state = {
        elementDimensions: {},
        contentDimensions: {},
        excludedElements: []
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
        this.onClick = this.onClick.bind(this)
        this.onResize = this.onResize.bind(this)
        this.addElement = this.addElement.bind(this)
        this.removeElement = this.removeElement.bind(this)
    }

    addElement(element) {
        const {excludedElements} = this.state
        if (element && !excludedElements.includes(element)) {
            this.setState({excludedElements: [...excludedElements, element]})
        }
    }

    removeElement(element) {
        const {excludedElements} = this.state
        if (element && excludedElements.includes(element)) {
            this.setState({excludedElements: _.without(excludedElements, element)})
        }
    }

    getExcludedElements() {
        const {element, elementBlur} = this.props
        const {excludedElements} = this.state
        return _.compact([
            elementBlur ? null : element,
            ...excludedElements
        ])
    }

    render() {
        const {className, onBlur} = this.props
        const {left, right, maxWidth, hPlacement, flipped} = this.getCorrectedHorizontalPosition()
        const {top, bottom, maxHeight, vPlacement} = this.getCorrectedVerticalPosition()

        const style = {
            '--top': Math.round(top),
            '--bottom': Math.round(bottom),
            '--max-height': Math.round(maxHeight),
            '--left': Math.round(left),
            '--right': Math.round(right),
            '--max-width': Math.round(maxWidth)
        }

        return (
            <Portal type='global'>
                <Context.Provider value={{
                    addElement: this.addElement,
                    removeElement: this.removeElement
                }}>
                    <BlurDetector
                        onClick={this.onClick}
                        onBlur={onBlur}
                        exclude={this.getExcludedElements()}
                        ref={this.ref}
                        className={[
                            styles.box,
                            styles[`vertical-${vPlacement}`],
                            styles[`horizontal-${hPlacement}`],
                            className
                        ].join(' ')}
                        style={style}>
                        {this.renderChildren(flipped)}
                    </BlurDetector>
                </Context.Provider>
            </Portal>
        )
    }

    renderChildren(flipped = false) {
        const {children} = this.props
        return _.isFunction(children)
            ? children({flipped})
            : children
    }

    onClick(e) {
        e.stopPropagation()
    }

    fixVerticalOverflow(vertical) {
        // top overflow has the priority
        return this.fixTopOverflow(this.fixBottomOverflow(vertical))
    }

    fixTopOverflow({top, bottom, maxHeight, vPlacement}) {
        if (top < MARGIN) {
            return {
                top: MARGIN,
                bottom: Math.max(bottom + top - MARGIN, MARGIN),
                maxHeight,
                vPlacement
            }
        } else {
            return {top, bottom, maxHeight, vPlacement}
        }
    }

    fixBottomOverflow({top, bottom, maxHeight, vPlacement}) {
        if (bottom < MARGIN) {
            return {
                top: Math.max(top + bottom - MARGIN, MARGIN),
                bottom: MARGIN,
                maxHeight,
                vPlacement
            }
        } else {
            return {top, bottom, maxHeight, vPlacement}
        }
    }

    getCorrectedVerticalPosition() {
        const {vPlacement} = this.props
        return this.fixVerticalOverflow(this.getVerticalPosition(vPlacement))
    }

    getVerticalPosition(vPlacement) {
        const {viewportDimensions: {height: viewportHeight}} = this.props
        const {elementDimensions: {top: elementTop, bottom: elementBottom}, contentDimensions: {height: contentHeight}} = this.state
        const verticalElementCenter = (elementBottom + elementTop) / 2

        if (contentHeight) {
            switch (vPlacement) {
                case 'center':
                    return {
                        top: verticalElementCenter - contentHeight / 2,
                        bottom: viewportHeight - verticalElementCenter - contentHeight / 2,
                        maxHeight: viewportHeight,
                        vPlacement
                    }
                case 'above':
                    return {
                        top: elementTop - contentHeight,
                        bottom: viewportHeight - elementTop,
                        maxHeight: elementTop,
                        vPlacement
                    }
                case 'over-above':
                    return {
                        top: elementBottom - contentHeight,
                        bottom: viewportHeight - elementBottom,
                        maxHeight: elementBottom,
                        vPlacement
                    }
                case 'over':
                    return {
                        top: elementTop,
                        bottom: viewportHeight - elementBottom,
                        maxHeight: elementBottom - elementTop,
                        vPlacement
                    }
                case 'over-below':
                    return {
                        top: elementTop,
                        bottom: viewportHeight - elementTop - contentHeight,
                        maxHeight: viewportHeight - elementTop,
                        vPlacement
                    }
                case 'below':
                    return {
                        top: elementBottom,
                        bottom: viewportHeight - elementBottom - contentHeight,
                        maxHeight: viewportHeight - elementBottom,
                        vPlacement
                    }
                case 'above-or-below':
                    return this.getAboveOrBelowVerticalPosition()
                case 'below-or-above':
                    return this.getBelowOrAboveVerticalPosition()
                case 'fit-above-or-below':
                    return this.getAboveOrBelowVerticalPosition(contentHeight)
                case 'fit-below-or-above':
                    return this.getBelowOrAboveVerticalPosition(contentHeight)
            }
        }
        return {}
    }

    getAboveOrBelowVerticalPosition(contentHeight) {
        const above = this.getVerticalPosition('above')
        const below = this.getVerticalPosition('below')
        const fitsAbove = contentHeight && above.maxHeight >= contentHeight
        const enoughSpaceAbove = above.maxHeight >= VERTICAL_PRIORITY_MIN_PX
        const notEnoughSpaceBelow = above.maxHeight >= below.maxHeight
        return fitsAbove || enoughSpaceAbove || notEnoughSpaceBelow
            ? above
            : below
    }

    getBelowOrAboveVerticalPosition(contentHeight) {
        const below = this.getVerticalPosition('below')
        const above = this.getVerticalPosition('above')
        const fitsBelow = contentHeight && below.maxHeight >= contentHeight
        const enoughSpaceBelow = below.maxHeight >= VERTICAL_PRIORITY_MIN_PX
        const notEnoughSpaceAbove = below.maxHeight >= above.maxHeight
        return fitsBelow || enoughSpaceBelow || notEnoughSpaceAbove
            ? below
            : above
    }

    fixHorizontalOverflow(horizontal) {
        // left overflow has the priority
        return this.fixLeftOverflow(this.fixRightOverflow(horizontal))
    }

    fixLeftOverflow({left, right, maxWidth, hPlacement, flipped}) {
        if (left < MARGIN) {
            return {
                left: MARGIN,
                right: Math.max(right + left - MARGIN, MARGIN),
                maxWidth,
                hPlacement,
                flipped
            }
        } else {
            return {left, right, maxWidth, hPlacement, flipped}
        }
    }

    fixRightOverflow({left, right, maxWidth, hPlacement, flipped}) {
        if (right < MARGIN) {
            return {
                left: Math.max(left + right - MARGIN, MARGIN),
                right: MARGIN,
                maxWidth,
                hPlacement,
                flipped
            }
        } else {
            return {left, right, maxWidth, hPlacement, flipped}
        }
    }

    getCorrectedHorizontalPosition() {
        const {hPlacement} = this.props
        return this.fixHorizontalOverflow(this.getHorizontalPosition(hPlacement))
    }

    getHorizontalPosition(hPlacement) {
        const {viewportDimensions: {width: viewportWidth}} = this.props
        const {elementDimensions: {left: elementLeft, right: elementRight}, contentDimensions: {width: contentWidth}} = this.state
        const horizontalElementCenter = (elementRight + elementLeft) / 2

        if (contentWidth) {
            switch (hPlacement) {
                case 'center':
                    return {
                        left: horizontalElementCenter - contentWidth / 2,
                        right: viewportWidth - horizontalElementCenter - contentWidth / 2,
                        maxWidth: viewportWidth,
                        hPlacement
                    }
                case 'left':
                    return {
                        left: elementLeft - contentWidth,
                        right: viewportWidth - elementLeft,
                        maxWidth: elementLeft,
                        hPlacement
                    }
                case 'over-left':
                    return {
                        left: elementRight - contentWidth,
                        right: viewportWidth - elementRight,
                        maxWidth: elementRight,
                        hPlacement
                    }
                case 'over':
                    return {
                        left: elementLeft,
                        right: viewportWidth - elementRight,
                        maxWidth: elementRight - elementLeft,
                        hPlacement
                    }
                case 'over-right':
                    return {
                        left: elementLeft,
                        right: viewportWidth - elementLeft - contentWidth,
                        maxWidth: viewportWidth - elementLeft,
                        hPlacement
                    }
                case 'right':
                    return {
                        left: elementRight,
                        right: viewportWidth - elementRight - contentWidth,
                        maxWidth: viewportWidth - elementRight,
                        hPlacement
                    }
                case 'left-or-right':
                    return this.getLeftOrRightVerticalPosition(contentWidth, false)
                case 'right-or-left':
                    return this.getRightOrLeftVerticalPosition(contentWidth, false)
                case 'over-left-or-over-right':
                    return this.getLeftOrRightVerticalPosition(contentWidth, true)
                case 'over-right-or-over-left':
                    return this.getRightOrLeftVerticalPosition(contentWidth, true)
            }
        }
        return {}
    }

    getLeftOrRightVerticalPosition(contentWidth, over) {
        const left = this.getHorizontalPosition(over ? 'over-left' : 'left')
        const right = this.getHorizontalPosition(over ? 'over-right' : 'right')
        const fitsLeft = contentWidth && left.maxWidth >= contentWidth
        const notEnoughSpaceRight = left.maxWidth >= right.maxWidth
        return fitsLeft || notEnoughSpaceRight
            ? left
            : {...right, flipped: true}
    }

    getRightOrLeftVerticalPosition(contentWidth, over) {
        const right = this.getHorizontalPosition(over ? 'over-right' : 'right')
        const left = this.getHorizontalPosition(over ? 'over-left' : 'left')
        const fitsRight = contentWidth && right.maxWidth >= contentWidth
        const notEnoughSpaceLeft = right.maxWidth >= left.maxWidth
        return fitsRight || notEnoughSpaceLeft
            ? right
            : {...left, flipped: true}
    }

    onResize(contentDimensions) {
        this.setState({contentDimensions})
    }

    updateState(state) {
        this.setState(
            prevState => _.isEqual(_.pick(prevState, _.keys(state)), state)
                ? null
                : state
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
        const {floatingBox} = this.props
        if (floatingBox) {
            floatingBox.addElement(this.ref.current)
        }
        this.updateDimensions()
    }

    componentDidUpdate() {
        const {floatingBox} = this.props
        if (floatingBox) {
            floatingBox.addElement(this.ref.current)
        }
        this.updateDimensions()
    }

    componentWillUnmount() {
        const {floatingBox} = this.props
        if (floatingBox) {
            floatingBox.removeElement(this.ref.current)
        }
    }
}

export const FloatingBox = compose(
    _FloatingBox,
    connect(mapStateToProps),
    withFloatingBox(),
    withForwardedRef()
)

FloatingBox.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    element: PropTypes.object,
    elementBlur: PropTypes.any,
    hPlacement: PropTypes.oneOf(['center', 'left', 'over-left', 'over', 'over-right', 'right', 'left-or-right', 'right-or-left', 'over-left-or-over-right', 'over-right-or-over-left']),
    vPlacement: PropTypes.oneOf(['center', 'above', 'over-above', 'over', 'over-below', 'below', 'above-or-below', 'below-or-above', 'fit-above-or-below', 'fit-below-or-above']),
    onBlur: PropTypes.func
}

FloatingBox.defaultProps = {
    hPlacement: 'over-right',
    vPlacement: 'below',
    elementBlur: false
}
