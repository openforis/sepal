import {compose} from 'compose'
import {withMap} from './mapContext'
import React from 'react'
import format from 'format'
import styles from './mapScale.module.css'

class MapToolbar extends React.Component {
    render() {
        const {map} = this.props
        const scale = map.getScale()

        return scale
            ? (
                <div className={styles.container}>
                    {format.number({value: scale, unit: 'm/px'})}
                </div>
            )
            : null
    }
}

MapToolbar.propTypes = {}

export default compose(
    MapToolbar,
    withMap()
)
