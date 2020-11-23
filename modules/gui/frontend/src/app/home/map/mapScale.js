import {compose} from 'compose'
import {withMapContext} from './mapContext'
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
    withMapContext()
)
