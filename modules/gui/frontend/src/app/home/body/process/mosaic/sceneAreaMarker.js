import {MapObject, google, googleMap} from 'app/home/map/map'
import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {connect} from 'store'
import React from 'react'
import styles from './sceneAreas.module.css'

const mapStateToProps = (state, ownProps) => {
    const {recipeId, sceneAreaId} = ownProps
    const recipeState = RecipeState(recipeId)
    const selectedScenes = recipeState(['model.scenes', sceneAreaId]) || []
    return {
        selectedSceneCount: selectedScenes.length,
        loading: recipeState('ui.autoSelectingScenes'),
        zoom: state.map.zoom
    }
}

class SceneAreaMarker extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId, polygon} = props
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

    renderSceneAreaCount(zoom, count) {
        return zoom > 4
            ? <text x={0} y={0} fontSize={40} textAnchor='middle' alignmentBaseline='central'>{count}</text>
            : null
    }

    render() {
        const {zoom, sceneAreaId, selectedSceneCount, loading} = this.props
        const scale = Math.min(1, Math.pow(zoom, 2.5) / Math.pow(8, 2.5))
        const size = `${1.5 * 4 * scale}rem`
        return (
            <MapObject
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
                    onClick={() => loading ? null : this.selectScenes(sceneAreaId)}>
                    <circle cx={0} cy={0} r={80}/>
                    {this.renderSceneAreaCount(zoom, selectedSceneCount)}
                </svg>
            </MapObject>
        )
    }

    selectScenes(sceneAreaId) {
        this.recipeActions.setSceneSelection(sceneAreaId).dispatch()
    }

}

export default connect(mapStateToProps)(SceneAreaMarker)
