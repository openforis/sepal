import {compose} from 'compose'
import {withMap} from './map'
import React from 'react'
import styles from './mapScale.module.css'

class MapToolbar extends React.Component {
    render() {
        const {metersPerPixel} = this.props
        return metersPerPixel
            ? (
                <div className={styles.container}>
                    {metersPerPixel}m/px
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
