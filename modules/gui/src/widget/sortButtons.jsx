import PropTypes from 'prop-types'
import React from 'react'

import {ButtonGroup} from './buttonGroup'
import {SortButton} from './sortButton'

export class SortButtons extends React.Component {
    constructor(props) {
        super(props)
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
                shape='pill'
                label={labels[column]}
                sorted={sortingOrder === column}
                sortingDirection={sortingDirection}
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
