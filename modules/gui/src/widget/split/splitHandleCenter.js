import PropTypes from 'prop-types'
import React from 'react'

import {SplitHandle} from './splitHandle'
import styles from './splitView.module.css'

export class SplitHandleCenter extends React.Component {
    render() {
        const {position, size, onDragging, onPosition} = this.props
        return (
            <SplitHandle
                name='center'
                classNames={this.getClassNames()}
                position={position}
                size={size}
                onDragging={onDragging}
                onPosition={onPosition}
            />
        )
    }

    getClassNames() {
        return [
            styles.handle,
            styles.center
        ]
    }
}

SplitHandleCenter.propTypes = {
    position: PropTypes.object.isRequired,
    size: PropTypes.object.isRequired,
    onDragging: PropTypes.func.isRequired,
    onPosition: PropTypes.func.isRequired
}
