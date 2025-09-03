import React from 'react'
import {merge, Subject, timer} from 'rxjs'

import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {Keybinding} from '~/widget/keybinding'

import {withMapsContext} from './maps'
import styles from './staticMap.module.css'

const MIN_ZOOM = 0
const MAX_ZOOM = 5

class _StaticMap extends React.Component {
    map = React.createRef()
    randomize$ = new Subject()

    constructor(props) {
        super(props)
        this.randomize = this.randomize.bind(this)
    }

    render() {
        return (
            <Keybinding keymap={{'Ctrl+Shift+R': this.randomize}}>
                <div className={styles.map} ref={this.map}/>
            </Keybinding>
        )
    }

    randomize() {
        this.randomize$.next()
    }

    setRandomView(map) {
        map.setCenter({
            lng: 360 * Math.random() - 180,
            lat: 90 * Math.random() - 45
        })
        map.setZoom(Math.round((MAX_ZOOM - MIN_ZOOM) * Math.random() + MIN_ZOOM))
    }

    componentDidMount() {
        const {mapsContext: {createGoogleMap}, addSubscription} = this.props
        const map = createGoogleMap(this.map.current)
        addSubscription(
            merge(this.randomize$, timer(1000)).subscribe(() => this.setRandomView(map))
        )
    }
}

export const StaticMap = compose(
    _StaticMap,
    withMapsContext(),
    withSubscriptions()
)

StaticMap.propTypes = {}
