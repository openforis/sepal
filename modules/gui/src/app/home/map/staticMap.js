import {compose} from 'compose'
import {withMapsContext} from './maps'
import React from 'react'
import styles from './staticMap.module.css'

const MIN_ZOOM = 0
const MAX_ZOOM = 5

class _StaticMap extends React.Component {
    map = React.createRef()

    render() {
        return (
            <div className={styles.map} ref={this.map}/>
        )
    }

    randomize(map) {
        map.setCenter({
            lng: 360 * Math.random() - 180,
            lat: 90 * Math.random() - 45
        })
        map.setZoom(Math.round((MAX_ZOOM - MIN_ZOOM) * Math.random() + MIN_ZOOM))
    }

    componentDidMount() {
        const {mapsContext: {createGoogleMap}} = this.props
        const map = createGoogleMap(this.map.current)
        setTimeout(() => this.randomize(map), 1000)
    }
}

export const StaticMap = compose(
    _StaticMap,
    withMapsContext()
)

StaticMap.propTypes = {}
