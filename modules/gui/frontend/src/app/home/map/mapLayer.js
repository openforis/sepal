import {compose} from 'compose'
import {withMapContext} from './mapContext'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

class _MapLayer extends React.Component {
    state = {
        shown: false,
        projection: null
    }

    constructor(props) {
        super(props)
        const {mapContext: {sepalMap}} = props
        const {google, googleMap} = sepalMap.getGoogle()

        class ReactOverlayView extends google.maps.OverlayView {
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
                <ProjectionContext.Provider value={{projection}}>
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

MapLayer.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}

class _MapObject extends React.Component {
    render() {
        const {mapContext: {sepalMap}, lat, lng, width, height, className, children} = this.props
        const {google, googleMap} = sepalMap.getGoogle()
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
                    const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng))
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
    // connect(state => ({projectionChange: state.map.projectionChange})),
    withMapContext()
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
