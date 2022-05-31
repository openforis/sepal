import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {FixedSizeList} from 'react-window'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

export class FastList extends React.Component {
    state = {
        itemHeight: null
    }

    constructor(props) {
        super(props)
        this.renderItems = this.renderItems.bind(this)
        this.renderItem = this.renderItem.bind(this)
        this.setHeight = this.setHeight.bind(this)
    }
    
    render() {
        const {itemHeight} = this.state
        return itemHeight
            ? this.renderList()
            : this.renderSampleItem()
    }

    renderSampleItem() {
        const {items} = this.props
        return items && items.length
            ? this.renderItem({
                data: items,
                index: 0,
                ref: this.setHeight
            })
            : null
    }

    setHeight(element) {
        if (element) {
            const {height: itemHeight} = element.getBoundingClientRect()
            this.setState({itemHeight})
        }
    }

    renderList() {
        return (
            <ElementResizeDetector>
                {this.renderItems}
            </ElementResizeDetector>
        )
    }

    renderItems({height}) {
        const {items, itemKey} = this.props
        const {itemHeight} = this.state
        return (
            <FixedSizeList
                height={height}
                itemData={items}
                itemCount={items.length}
                itemSize={itemHeight}
                itemKey={(index, data) => itemKey(data[index])}
                width='100%'>
                {this.renderItem}
            </FixedSizeList>
        )
    }

    renderItem({data, index = 0, style, ref}) {
        const {children} = this.props
        return (
            <div style={style} ref={ref}>
                {children(data[index])}
            </div>
        )
    }
}

FastList.propTypes = {
    children: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    itemKey: PropTypes.func
}
