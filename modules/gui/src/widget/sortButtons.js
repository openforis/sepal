import {Button} from 'widget/button'
import {ButtonGroup} from './buttonGroup'
import PropTypes from 'prop-types'
import React from 'react'

class SortButton extends React.Component {
    constructor() {
        super()
        this.toggleSortOrder = this.toggleSortOrder.bind(this)
    }

    render() {
        const {label, sorted, sortOrder} = this.props
        return (
            <Button
                chromeless
                look='transparent'
                shape='pill'
                label={label}
                labelStyle={sorted ? 'smallcaps-highlight' : 'smallcaps'}
                icon={this.getHandleIcon(sortOrder)}
                iconPlacement='right'
                onClick={this.toggleSortOrder}/>
        )
    }

    getHandleIcon(sortOrder) {
        const {sorted} = this.props
        const orderMap = {
            '-1': 'sort-up',
            '0': 'sort',
            '1': 'sort-down'
        }
        return orderMap[sorted ? sortOrder : 0]
    }

    toggleSortOrder() {
        const {sorted, sortOrder, onChange} = this.props
        onChange(sorted ? -sortOrder : 1)
    }
}

SortButton.propTypes = {
    onChange: PropTypes.any.isRequired,
    label: PropTypes.any,
    sorted: PropTypes.any,
    sortOrder: PropTypes.oneOf([-1, 0, 1])
}

export class SortButtons extends React.Component {
    constructor() {
        super()
        this.renderButton = this.renderButton.bind(this)
    }

    render() {
        return (
            <ButtonGroup spacing='tight'>
                {this.renderButtons()}
            </ButtonGroup>
        )
    }

    renderButtons() {
        const {labels} = this.props
        return Object.keys(labels).map(this.renderButton)
    }

    renderButton(column) {
        const {labels} = this.props
        const {sortingOrder, sortingDirection, onChange} = this.props
        return (
            <SortButton
                key={column}
                label={labels[column]}
                sorted={sortingOrder === column}
                sortOrder={sortingDirection}
                onChange={sortingDirection => onChange(column, sortingDirection)}
            />
        )
    }
}

SortButtons.propTypes = {
    onChange: PropTypes.any.isRequired,
    labels: PropTypes.object,
    sortingDirection: PropTypes.oneOf([-1, 1]),
    sortingOrder: PropTypes.string
}
