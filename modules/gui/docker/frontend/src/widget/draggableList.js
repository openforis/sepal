import {Draggable} from './draggable'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withSubscriptions from 'subscription'

class _DraggableList extends React.Component {
    drag$ = new Subject()

    state = {
        items: [],
        inside: true
    }
    
    constructor() {
        super()
        this.onDrag = this.onDrag.bind(this)
        this.clearDragSource()
        this.clearDragDestination()
    }

    setDragSource(value, size) {
        this.dragSource = {size, value}
    }

    clearDragSource() {
        this.dragSource = {}
    }

    setDragDestination(value) {
        this.dragDestination = {value}
    }

    clearDragDestination() {
        this.dragDestination = {}
    }

    render() {
        const {dragSource: {value}} = this
        const {itemId} = this.props
        const {items, inside} = this.state
        return items
            .map((item, index) => this.renderItem({item, index, show: inside || itemId(item) !== value}))
    }

    renderItem({item, index, show}) {
        const {drag$} = this
        const {itemId, children} = this.props
        const id = itemId(item)
        return (
            <Draggable
                key={id}
                drag$={drag$}
                dragValue={id}
                show={show}
            >
                {children(item, index)}
            </Draggable>
        )
    }

    onDrag({value, dragStart, dragMove, dragEnd, dragOver, dragOut}) {
        dragStart && this.onDragStart(value, dragStart)
        dragMove && this.onDragMove(value, dragMove)
        dragEnd && this.onDragEnd(value, dragEnd)
        dragOver && this.onDragOver(value, dragOver)
        dragOut && this.onDragOut(value, dragOut)
    }

    onDragStart(value, {size}) {
        const {onDragStart} = this.props
        onDragStart && onDragStart(value)
        this.setDragSource(value, size)
    }

    onDragMove(value, {coords: {x, y}}) {
        const {containerElement} = this.props
        if (containerElement) {
            const element = document.elementFromPoint(x, y)
            this.setState({inside: containerElement.contains(element)})
        }
    }

    onDragEnd(value) {
        const {onDragEnd} = this.props
        const {dragSource: {value: srcValue}, dragDestination: {value: dstValue}} = this
        onDragEnd && onDragEnd(value)
        if (_.isNil(dstValue)) {
            this.onRelease(srcValue)
        } else {
            this.onDrop(srcValue, dstValue)
        }
        this.clearDragSource()
        this.clearDragDestination()
    }

    onDragOver(dstValue, {srcValue}) {
        const {onDragOver} = this.props
        onDragOver && onDragOver(srcValue, dstValue)
        this.setDragDestination(dstValue)
        this.move(srcValue, dstValue)
    }

    onDragOut(value, {srcValue}) {
        const {onDragOut} = this.props
        onDragOut && onDragOut(srcValue, value)
        this.clearDragDestination()
        // this.remove(srcValue)
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

    componentDidMount() {
        const {drag$, onDrag} = this
        const {items, addSubscription} = this.props
        addSubscription(
            drag$.subscribe(onDrag)
        )
        this.setState({items})
    }

    componentDidUpdate({items: prevItems}) {
        const {items} = this.props
        if (!_.isEqual(items, prevItems)) {
            this.setState({items})
        }
    }
}

export const DraggableList = compose(
    _DraggableList,
    withSubscriptions()
)

DraggableList.propTypes = {
    children: PropTypes.func.isRequired,
    itemId: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    containerElement: PropTypes.any,
    onChange: PropTypes.func,
    onDragEnd: PropTypes.func,
    onDragOut: PropTypes.func,
    onDragOver: PropTypes.func,
    onDragStart: PropTypes.func,
    onDrop: PropTypes.func,
    onRelease: PropTypes.func
}
