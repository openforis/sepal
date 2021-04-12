import {compose} from 'compose'
import {withMapsContext} from './maps'
import React from 'react'
import styles from './map.module.css'

class _StaticMap extends React.Component {
    map = React.createRef()

    render() {
        const {children} = this.props
        return (
            <React.Fragment>
                <div ref={this.map} className={styles.map}/>
                <div className={styles.content}>
                    {children}
                </div>
            </React.Fragment>
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
