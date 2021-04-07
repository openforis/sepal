import {compose} from 'compose'
import {withMap} from './map'
import React from 'react'
import format from 'format'
import styles from './mapScale.module.css'

class MapToolbar extends React.Component {
    render() {
        const {metersPerPixel} = this.props
        return metersPerPixel
            ? (
                <div className={styles.container}>
                    {format.number({value: metersPerPixel, unit: 'm/px'})}
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
