import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './droppable.module.css'
import withSubscriptions from 'subscription'

class _Droppable extends React.Component {
    state = {
        value: null
    }

    constructor() {
        super()
        this.onDrag = this.onDrag.bind(this)
        this.onMouseOver = this.onMouseOver.bind(this)
        this.onMouseOut = this.onMouseOut.bind(this)
    }

    getContent() {
        const {main, children} = this.props
        return main || children
    }

    isDisabled() {
        const {disabled} = this.props
        return disabled
    }

    isClickable() {
        const {disabled, onClick} = this.props
        return !disabled && onClick
    }

    isDroppable() {
        const {disabled, drag$, onDrop} = this.props
        return !disabled && (drag$ || onDrop)
    }

    onMouseOver() {
        const {onMouseOver} = this.props
        onMouseOver && onMouseOver()
    }

    onMouseOut() {
        const {onMouseOut} = this.props
        onMouseOut && onMouseOut()
    }

    // onClick() {
    //     const {onClick} = this.props
    //     if (!this.isDisabled() && !this.isDragging()) {
    //         onClick && onClick()
    //     }
    // }

    isDragging() {
        const {value} = this.state
        return !!value
    }

    render() {
        const {value, coords} = this.state
        const content = this.getContent()
        return (
            <div
                className={[
                    styles.droppable,
                    this.isDragging() ? styles.dragging : null
                ].join(' ')}
                onMouseOver={this.onMouseOver}
                onMouseOut={this.onMouseOut}>
                {content({value, coords})}
            </div>
        )
    }

    onDrag({dragging, value, coords}) {
        if (dragging === true) {
            this.onDragStart(value)
        }
        if (dragging === false) {
            this.onDragEnd()
        }
        if (coords) {
            this.setState({coords})
        }
    }

    onDragStart(value) {
        const {onDragStart} = this.props
        onDragStart && onDragStart(value)
        this.setState({value})
    }

    onDragEnd() {
        const {onDragEnd} = this.props
        const {value} = this.state
        onDragEnd && onDragEnd(value)
        this.setState({value: null})
    }

    initializeDroppable() {
        const {drag$, addSubscription} = this.props
        addSubscription(
            drag$.subscribe(this.onDrag)
        )
    }

    componentDidMount() {
        if (this.isDroppable()) {
            // this.initializeDroppable()
        }
    }
}

export const Droppable = compose(
    _Droppable,
    withSubscriptions()
)

Droppable.propTypes = {
    drag$: PropTypes.object.isRequired,
    onDrop: PropTypes.func.isRequired,
    onDragEnd: PropTypes.func,
    onDragStart: PropTypes.func,
    // children: PropTypes.any,
    // className: PropTypes.string,
    // disabled: PropTypes.any,
    // dragCloneClassName: PropTypes.string,
    // dragtooltip: PropTypes.any,
    // dragValue: PropTypes.any,
    // main: PropTypes.any,
    // showHandle: PropTypes.any,
    // onClick: PropTypes.func,
    // onDrag: PropTypes.func,
    // onDragEnd: PropTypes.func,
    // onDragStart: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}
