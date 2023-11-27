import {MapObject} from 'app/home/map/mapLayer'
import {RecipeActions} from 'app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './sceneAreasLayer.module.css'

class _SceneAreaMarker extends React.Component {
    constructor(props) {
        super(props)
        const {map, recipeId, polygon} = props
        const {google} = map.getGoogle()
        this.recipeActions = RecipeActions(recipeId)
        const gPolygon = new google.maps.Polygon({
            paths: polygon.map(([lat, lng]) =>
                new google.maps.LatLng(lat, lng)),
            fillColor: '#000000',
            fillOpacity: 0.4,
            strokeColor: '#636363',
            strokeOpacity: 0.6,
            strokeWeight: 1
        })
        const bounds = new google.maps.LatLngBounds()
        gPolygon.getPaths().getArray().forEach(path =>
            path.getArray().forEach(latLng =>
                bounds.extend(latLng)
            ))
        this.polygon = gPolygon
        this.center = bounds.getCenter()
    }

    renderSceneAreaCount(fontSize) {
        const {map, selectedSceneCount} = this.props
        const zoom = map.getZoom()
        return zoom > 4
            ? <text x={0} y={0} fontSize={fontSize} textAnchor='middle' dominantBaseline='middle'>{selectedSceneCount}</text>
            : null
    }

    render() {
        const {map, loading} = this.props
        const zoom = map.getZoom()
        const scale = Math.min(1, Math.pow(zoom, 2.5) / Math.pow(8, 2.5))
        const size = `${1.5 * 4 * scale}em`
        const {googleMap} = map.getGoogle()
        return (
            <MapObject
                map={map}
                lat={this.center.lat()}
                lng={this.center.lng()}
                width={size}
                height={size}
                className={[styles.sceneArea, loading ? styles.loading : null].join(' ')}>
                <svg
                    height={size}
                    width={size}
                    viewBox={'-100 -100 200 200'}
                    onMouseOver={() => !loading && this.polygon.setMap(googleMap)}
                    onMouseLeave={() => this.polygon.setMap(null)}
                    onClick={() => loading ? null : this.selectScenes()}>
                    <circle cx={0} cy={0} r={80}/>
                    {this.renderSceneAreaCount(20 + 20 / scale)}
                </svg>
            </MapObject>
        )
    }

    selectScenes() {
        const {sceneAreaId, sceneSelection} = this.props
        this.recipeActions.setSceneSelection(sceneAreaId).dispatch()
        sceneSelection.activate()
    }
}

export const SceneAreaMarker = compose(
    _SceneAreaMarker
)

SceneAreaMarker.propTypes = {
    polygon: PropTypes.array,
    recipeId: PropTypes.string,
    sceneAreaId: PropTypes.string,
    sceneSelection: PropTypes.object,
    selectedSceneCount: PropTypes.number
}
