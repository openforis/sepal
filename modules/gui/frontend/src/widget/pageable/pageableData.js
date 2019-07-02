import {Consumer} from './pageableContext'
import OverflowDetector from 'widget/overflowDetector'
import PropTypes from 'prop-types'
import React from 'react'

export class PageableData extends React.Component {
    ref = React.createRef()
    render() {
        const {itemKey, direction, className, children} = this.props
        return (
            <Consumer>
                {({items, next}) =>
                    <OverflowDetector className={className}>
                        {isOverflown =>
                            <PageItems
                                items={items || []}
                                next={() => next(isOverflown(direction))}
                                itemKey={itemKey}>
                                {children}
                            </PageItems>
                        }
                    </OverflowDetector>
                }
            </Consumer>
        )
    }
}

PageableData.propTypes = {
    children: PropTypes.func.isRequired,
    itemKey: PropTypes.func.isRequired,
    className: PropTypes.string,
    direction: PropTypes.any
}

class PageItems extends React.Component {
    render() {
        const {items} = this.props
        return items.map(
            (item, index) => this.renderItem(item, index)
        )
    }

    renderItem(item, index) {
        const {itemKey, children} = this.props
        const key = itemKey(item) || index
        return (
            <PageItem
                key={key}
                item={item}>
                {children}
            </PageItem>
        )
    }

    componentDidUpdate() {
        const {next} = this.props
        next()
    }
}

PageItems.propTypes = {
    children: PropTypes.any.isRequired,
    itemKey: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    next: PropTypes.func.isRequired
}

class PageItem extends React.Component {
    render() {
        const {item, children} = this.props
        return children(item)
    }

    shouldComponentUpdate(nextProps) {
        return nextProps.item !== this.props.item
    }
}
