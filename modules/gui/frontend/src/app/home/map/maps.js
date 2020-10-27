import {Loader} from 'google-maps'
import {compose} from 'compose'
import {connect} from 'store'
import {from, of, zip} from 'rxjs'
import {map, switchMap} from 'rxjs/operators'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

const GOOGLE_MAPS_VERSION = '3.42'

export const MapsContext = React.createContext()

export const withMapsContext = withContext(MapsContext, 'mapsContext')

class _Maps extends React.Component {
    state = {
        mapsContext: null
    }

    constructor(props) {
        super(props)
        const {stream} = props
        stream('INIT_MAPS',
            this.initMaps$(),
            mapsContext => this.setState({mapsContext})
        )
    }

    initMaps$() {
        return api.map.loadApiKeys$().pipe(
            switchMap(({google: googleMapsApiKey, norwayPlanet: norwayPlanetApiKey}) =>
                zip(
                    this.initGoogleMaps$(googleMapsApiKey),
                    this.initNorwayPlanet$(norwayPlanetApiKey)
                )
            ),
            map(([google, norwayPlanet]) => {
                return {...google, ...norwayPlanet}
            })
        )
    }

    initGoogleMaps$(googleMapsApiKey) {
        const loader = new Loader(googleMapsApiKey, {
            version: GOOGLE_MAPS_VERSION,
            libraries: ['drawing']
        })
        return from(loader.load()).pipe(
            switchMap(google =>
                of({google, googleMapsApiKey})
            )
        )
    }

    initNorwayPlanet$(norwayPlanetApiKey) {
        return of({norwayPlanetApiKey})
    }

    render() {
        const {children} = this.props
        const {mapsContext} = this.state
        const initialized = !!mapsContext
        return (
            <MapsContext.Provider value={mapsContext}>
                {children(initialized)}
            </MapsContext.Provider>
        )
    }
}

export const Maps = compose(
    _Maps,
    connect()
)

Maps.propTypes = {
    children: PropTypes.any
}
