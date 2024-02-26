import {compose} from 'compose'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

class _MapLayer extends React.Component {
    state = {
        shown: false,
        projection: null,
        overlay: null
    }

    render() {
        const {shown, projection, overlay} = this.state
        const {className, children} = this.props
        if (!overlay) {
            return null
        }
        const mapPanes = overlay.getPanes()
        const content = (
            <div className={className}>
                <ProjectionContext.Provider value={{projection}}>
                    {children}
                </ProjectionContext.Provider>
            </div>
        )
        return shown && mapPanes
            ? <Portal type='container' content={content} container={mapPanes.overlayMouseTarget}/>
            : null
    }

    componentDidMount() {
        this.initOverlay()
    }

    componentDidUpdate() {
        this.initOverlay()
    }

    initOverlay() {
        const {overlay: initializedOverlay} = this.state
        const {map} = this.props
        if (initializedOverlay || !map.getGoogle()) {
            return
        }
        const {google, googleMap} = map.getGoogle()

        class ReactOverlayView extends google.maps.OverlayView {
            constructor(component) {
                super()
                this.component = component
                this.xyz = null
            }

            draw() {
                const projection = this.getProjection() // TODO: Zooming changes the projection...
                const point = projection.fromLatLngToDivPixel(new google.maps.core.LatLng(0, 0))
                const xyz = [point.x, point.y, map.getZoom()]
                if (!_.isEqual(this.xyz, xyz)) {
                    this.xyz = xyz
                    this.component.setState({projection})
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

        const overlay = new ReactOverlayView(this)
        overlay.setMap(googleMap)
        this.setState({overlay})
    }

    componentWillUnmount() {
        const {overlay} = this.state
        if (overlay) {
            overlay.setMap(null)
        }
    }
}

export const MapLayer = compose(
    _MapLayer
)

MapLayer.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}

class _MapObject extends React.Component {
    render() {
        const {map, lat, lng, width, height, className, children} = this.props
        const {google, googleMap} = map.getGoogle()
        const shown = googleMap.getBounds().contains({lng, lat})
        if (!shown) {
            return null
        }
        return (
            <ProjectionContext.Consumer>
                {({projection}) => {
                    if (!projection) {
                        return null
                    }
                    const point = projection.fromLatLngToDivPixel(new google.maps.core.LatLng(lat, lng))
                    const style = {
                        position: 'absolute',
                        top: `calc(${point.y}px - ${height} / 2)`,
                        left: `calc(${point.x}px - ${width} / 2)`
                    }
                    return (
                        <div style={style} className={className}>
                            {children}
                        </div>
                    )
                }}
            </ProjectionContext.Consumer>
        )
    }
}

export const MapObject = compose(
    _MapObject,
    // connect(state => ({projectionChange: state.map.projectionChange}))
)

MapObject.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    height: PropTypes.string,
    lat: PropTypes.number,
    lng: PropTypes.number,
    width: PropTypes.string
}

const ProjectionContext = React.createContext()
