import {Provider, withMapContext} from './mapContext'
// import {SepalMap} from './sepalMap'
import {compose} from 'compose'
import {withMapsContext} from './maps'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './map.module.css'
import withSubscriptions from 'subscription'

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

class _Map extends React.Component {
    state = {
        mapContext: null,
        bounds: null,
        linked: true,
        toggleLinked: this.toggleLinked.bind(this)
    }

    map = React.createRef()

    isLinked() {
        const {linked} = this.state
        return linked
    }

    toggleLinked() {
        const {linked: wasLinked, bounds} = this.state
        const linked = !wasLinked
        this.setState({linked}, () => {
            if (linked && bounds) {
                this.synchronizeThisMap(bounds)
            }
        })
    }

    render() {
        const {children} = this.props
        const {mapContext, linked, toggleLinked} = this.state
        return (
            <Provider value={{mapContext, linked, toggleLinked}}>
                <div ref={this.map} className={styles.map}/>
                <div className={styles.content}>
                    {mapContext ? children : null}
                </div>
            </Provider>
        )
    }

    synchronizeThisMap(bounds) {
        const {mapContext, linked} = this.state
        if (linked) {
            mapContext.sepalMap.fitBounds(bounds, 0)
        }
    }

    componentDidMount() {
        const {mapsContext: {createMapContext}, addSubscription} = this.props
        const {mapContext, bounds$, updateBounds} = createMapContext(this.map.current)

        this.boundChanged = mapContext.sepalMap.onBoundsChanged(() => {
            const {linked} = this.state
            if (linked) {
                updateBounds(mapContext.sepalMap.getBounds())
            }
        })

        addSubscription(
            bounds$.subscribe(
                bounds => {
                    this.synchronizeThisMap(bounds)
                    this.setState({bounds})
                }
            )
        )

        this.setState({mapContext})
    }

    componentWillUnmount() {
        this.boundsChanged && this.boundChanged.removeListener()
    }
}

export const Map = compose(
    _Map,
    withMapsContext(),
    withSubscriptions()
)

Map.propTypes = {
    children: PropTypes.object,
    className: PropTypes.string
}

class _MapLayer extends React.Component {
    state = {
        shown: false,
        projection: null
    }

    constructor(props) {
        super(props)
        const {mapContext: {google, googleMap, sepalMap}} = props

        const ReactOverlayView = class ReactOverlayView extends google.maps.OverlayView {
            constructor(component) {
                super()
                this.component = component
                this.xyz = null
            }
        
            draw() {
                const projection = this.getProjection() // TODO: Zooming changes the projection...
                const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(0, 0))
                const xyz = [point.x, point.y, sepalMap.getZoom()]
                if (!_.isEqual(this.xyz, xyz)) {
                    this.xyz = xyz
                    this.component.setState({projection})
                    // changeProjection(projection)
                    // actionBuilder('PROJECTION_CHANGED', {xyz})
                    //     .set('map.projectionChange', xyz)
                    //     .dispatch()
                }
            }
        
            show(shown) {
                this.component.setState({shown})
            }

            onAdd() {
                this.show(true)
            }
        
            onRemove() {
                this.show(false)
            }
        }
    
        this.overlay = new ReactOverlayView(this)
        this.overlay.setMap(googleMap)
    }

    render() {
        const {shown, projection} = this.state
        const {className, children} = this.props
        const mapPanes = this.overlay.getPanes()
        const content = (
            <div className={className}>
                <ProjectionContext.Provider value={projection}>
                    {children}
                </ProjectionContext.Provider>
            </div>
        )
        return shown && mapPanes
            ? <Portal type='container' content={content} container={mapPanes.overlayMouseTarget}/>
            : null
    }

    componentWillUnmount() {
        this.overlay.setMap(null)
    }
}

export const MapLayer = compose(
    _MapLayer,
    withMapContext()
)

class _MapObject extends React.Component {
    render() {
        const {mapContext: {google, googleMap}, lat, lng, width, height, className, children} = this.props
        const shown = googleMap.getBounds().contains({lng, lat})
        if (!shown)
            return null
        return (
            <ProjectionContext.Consumer>
                {projection => {
                    if (!projection)
                        return null
                    const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng))
                    const style = {
                        position: 'absolute',
                        top: `calc(${point.y}px - ${height} / 2)`,
                        left: `calc(${point.x}px - ${width} / 2)`
                    }
                    return <div style={style} className={className}>
                        {children}
                    </div>
                }
                }
            </ProjectionContext.Consumer>
        )
    }
}

export const MapObject = compose(
    _MapObject,
    // connect(state => ({projectionChange: state.map.projectionChange})),
    withMapContext()
)

const ProjectionContext = React.createContext()
