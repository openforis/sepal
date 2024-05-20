import PropTypes from 'prop-types'
import React from 'react'

import {Button} from '~/widget/button'

const orderMap = {
    '-1': 'sort-up',
    '0': 'sort',
    '1': 'sort-down'
}

export class SortButton extends React.Component {
    constructor() {
        super()
        this.toggleSortOrder = this.toggleSortOrder.bind(this)
    }

    render() {
        const {label, shape, additionalClassName, sorted, sortingDirection} = this.props
        return (
            <Button
                chromeless
                look='transparent'
                shape={shape}
                additionalClassName={additionalClassName}
                label={label}
                labelStyle={sorted ? 'smallcaps-highlight' : 'smallcaps'}
                icon={this.getHandleIcon(sortingDirection)}
                iconPlacement='right'
                onClick={this.toggleSortOrder}/>
        )
    }

    getHandleIcon(sortingDirection) {
        const {sorted} = this.props
        return orderMap[sorted ? sortingDirection : 0]
    }

    toggleSortOrder() {
        const {sorted, sortingDirection, defaultSortingDirection, onChange} = this.props
        onChange(sorted ? -sortingDirection : defaultSortingDirection)
    }
}

SortButton.propTypes = {
    onChange: PropTypes.any.isRequired,
    additionalClassName: PropTypes.any,
    defaultSortingDirection: PropTypes.oneOf([-1, 1]),
    label: PropTypes.any,
    shape: PropTypes.any,
    sorted: PropTypes.any,
    sortingDirection: PropTypes.oneOf([-1, 1])
}

SortButton.defaultProps = {
    shape: 'pill',
    defaultSortingDirection: 1
}
