import {compose} from 'compose'
import {withMapsContext} from './maps'
import React from 'react'
import styles from './staticMap.module.css'

class _StaticMap extends React.Component {
    map = React.createRef()

    render() {
        return (
            <div className={styles.map} ref={this.map}/>
        )
    }

    componentDidMount() {
        const {mapsContext: {createGoogleMap}} = this.props
        createGoogleMap(this.map.current)
    }
}

export const StaticMap = compose(
    _StaticMap,
    withMapsContext()
)

StaticMap.propTypes = {}
