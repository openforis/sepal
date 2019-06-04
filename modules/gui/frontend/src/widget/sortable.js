import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject} from 'rxjs'
import withSubscriptions from 'subscription'
import styles from './sortable.module.css'

export default class _Sortable extends React.Component {
    drag$ = new Subject()

    render() {
        const {items} = this.props

        return (
            <div
                ref={this.dropTarget}
                onDragOver={e => e.preventDefault()}
                onDrop={e => console.log('dropped in container', e)}>
                {items.map(item => this.renderDraggable(item))}
            </div>
        )
    }

    renderDraggable(item) {
        return (
            <div
                key={item.id}
                className={styles.row}
                draggable
                onDragStart={e => console.log('onDragStart')}
                onDragEnd={e => console.log('onDragEnd')}
                onDrag={e => this.drag$.next()}>
                <div className={styles.grip}/>
                {this.renderItem(item)}
            </div>
        )
    }

    renderItem(item) {
        const {children} = this.props
        const ignoreEvent = e => {
            e.stopPropagation()
            e.preventDefault()
        }
        return (
            <div
                className={styles.item}
                draggable
                onDragStart={ignoreEvent}
                onDragEnd={ignoreEvent}>
                {children(item)}
            </div>
        )
    }

    componentDidMount() {
    }
}

const Sortable = compose(
    _Sortable,
    withSubscriptions()
)

Sortable.propTypes = {
    items: PropTypes.array.isRequired,
    children: PropTypes.func.isRequired

}
