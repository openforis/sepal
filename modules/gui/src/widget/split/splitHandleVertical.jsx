import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {SplitHandle} from './splitHandle'
import styles from './splitView.module.css'

export class SplitHandleVertical extends React.Component {
    render() {
        const {position, size, onDragging, onPosition} = this.props
        return (
            <SplitHandle
                name='vertical'
                classNames={this.getClassNames()}
                position={position}
                size={size}
                direction='x'
                lockDirection='y'
                onDragging={onDragging}
                onPosition={onPosition}
            />
        )
    }

    getClassNames() {
        const {placements} = this.props
        const interferingPlacements = _.intersection(placements, ['top', 'bottom'])
        return _.flatten([
            styles.handle,
            styles.axis,
            styles.vertical,
            interferingPlacements.map(placement => styles[placement])
        ])
    }
}

SplitHandleVertical.propTypes = {
    position: PropTypes.object.isRequired,
    size: PropTypes.object.isRequired,
    onDragging: PropTypes.func.isRequired,
    onPosition: PropTypes.func.isRequired,
    placements: PropTypes.arrayOf(PropTypes.string)
}
