import {Draggable} from './draggable'
import {Subject} from 'rxjs'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

class _DraggableList extends React.Component {
    drag$ = new Subject()

    state = {
        items: [],
        inside: true
    }
    
    constructor() {
        super()
        this.dragSource = {}
        this.dragDestination = {}
        this.onDrag = this.onDrag.bind(this)
    }

    clearDragSource() {
        this.dragSource = {}
    }

    isHidden(item) {
        const {dragSource: {value}} = this
        const {itemId} = this.props
        const {inside} = this.state
        return !inside && itemId(item) === value
    }

    render() {
        const {items} = this.state
        return items
            .map((item, index) => this.renderItem({item, index, hidden: this.isHidden(item)}))
    }

    renderItem({item, index, hidden}) {
        const {drag$} = this
        const {itemRenderer, itemId, showHandle} = this.props
        const id = itemId(item)
        return (
            <Draggable
                key={id}
                drag$={drag$}
                dragValue={id}
                hidden={hidden}
                showHandle={showHandle}
                itemRenderer={itemRenderer}
                item={item}
                index={index}
            />
        )
    }

    onDrag({value, dragStart, dragMove, dragEnd, dragCancel, dragOver, dragOut}) {
        dragStart && this.onDragStart(value, dragStart)
        dragMove && this.onDragMove(value, dragMove)
        dragEnd && this.onDragEnd(value, dragEnd)
        dragCancel && this.onDragCancel(value, dragCancel)
        dragOver && this.onDragOver(value, dragOver)
        dragOut && this.onDragOut(value, dragOut)
    }

    onDragStart(value, {size}) {
        const {onDragStart} = this.props
        onDragStart && onDragStart(value)
        this.dragSource = {size, value}
    }

    onDragMove(value, {coords: {x: otherX, y: otherY}, _position}) {
        const {containerElement, onDragInside, onDragOutside} = this.props
        const {inside: wasInside} = this.state
        if (containerElement) {
            const {x: thisX, y: thisY, width, height} = containerElement.getBoundingClientRect()
            const inside = (otherX > thisX) && (otherX < thisX + width) && (otherY > thisY) && (otherY < thisY + height)
            if (wasInside !== inside) {
                this.setState({inside})
                !inside && onDragOutside && onDragOutside(value)
                inside && onDragInside && onDragInside(value)
            }
        }
    }

    onDragEnd(value) {
        const {onDragEnd} = this.props
        const {dragSource: {value: srcValue}, dragDestination: {value: dstValue}} = this
        const {inside} = this.state
        onDragEnd && onDragEnd(value)

        if (inside) {
            if (dstValue === null) {
                this.onReleaseInside(srcValue)
            } else {
                this.onDrop(srcValue, dstValue)
            }
        } else {
            this.onReleaseOutside(srcValue)
        }

        this.dragSource = {}
    }

    onDragCancel(value) {
        const {onDragCancel} = this.props
        onDragCancel && onDragCancel(value)
        this.reloadItems()
    }

    onDragOver(dstValue, {srcValue}) {
        const {onDragOver} = this.props
        if (srcValue !== dstValue) {
            onDragOver && onDragOver(srcValue, dstValue)
            this.move(srcValue, dstValue)
            this.dragDestination = {value: dstValue}
        }
    }

    onDragOut(dstValue, {srcValue}) {
        const {onDragOut} = this.props
        onDragOut && onDragOut(srcValue, dstValue)
    }

    onDrop(srcValue, dstValue) {
        const {onDrop, onChange} = this.props
        const {items} = this.state
        onDrop && onDrop(srcValue, dstValue)
        onChange && onChange(items)
    }

    onRelease(value) {
        const {onRelease} = this.props
        onRelease && onRelease(value)
    }

    onReleaseInside(value) {
        const {onReleaseInside} = this.props
        onReleaseInside && onReleaseInside(value)
    }

    onReleaseOutside(value) {
        const {onReleaseOutside} = this.props
        onReleaseOutside && onReleaseOutside(value)
    }

    move(srcValue, dstValue) {
        const {items} = this.state
        const updatedItems = [...items]
        const [removed] = updatedItems.splice(this.getIndex(srcValue), 1)
        updatedItems.splice(this.getIndex(dstValue), 0, removed)
        this.setState({items: updatedItems})
    }

    remove(srcValue) {
        const {items} = this.state
        const updatedItems = [...items]
        updatedItems.splice(this.getIndex(srcValue), 1)
        this.setState({items: updatedItems})
    }

    getIndex(value) {
        const {itemId} = this.props
        const {items} = this.state
        return items.findIndex(item => itemId(item) === value)
    }

    reloadItems() {
        const {items} = this.props
        this.setState({items})
    }

    componentDidMount() {
        const {drag$, onDrag} = this
        const {addSubscription} = this.props
        addSubscription(
            drag$.subscribe(onDrag)
        )
        this.reloadItems()
    }

    componentDidUpdate({items: prevItems}) {
        const {items} = this.props
        if (!_.isEqual(items, prevItems)) {
            this.reloadItems()
        }
    }
}

export const DraggableList = compose(
    _DraggableList,
    withSubscriptions()
)

DraggableList.propTypes = {
    itemId: PropTypes.func.isRequired,
    itemRenderer: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    containerElement: PropTypes.any,
    showHandle: PropTypes.any,
    onChange: PropTypes.func,
    onDragEnd: PropTypes.func,
    onDragInside: PropTypes.func,
    onDragOut: PropTypes.func,
    onDragOutside: PropTypes.func,
    onDragOver: PropTypes.func,
    onDragStart: PropTypes.func,
    onDrop: PropTypes.func,
    onRelease: PropTypes.func,
    onReleaseInside: PropTypes.func,
    onReleaseOutside: PropTypes.func
}
