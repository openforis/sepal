import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {google, googleMap, MapObject, sepalMap} from 'app/home/map/map'
import React from 'react'
import {connect} from 'store'
import styles from './sceneAreas.module.css'

const mapStateToProps = (state, ownProps) => {
    const {recipeId, sceneAreaId} = ownProps
    const recipeState = RecipeState(recipeId)
    const selectedScenes = recipeState(['scenes', sceneAreaId]) || []
    return {
        selectedSceneCount: selectedScenes.length,
        loading: recipeState('ui.autoSelectingScenes')
    }
}

class SceneAreaMarker extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId, polygon} = props
        this.recipe = RecipeActions(recipeId)
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
        gPolygon.getPaths().getArray().forEach((path) =>
            path.getArray().forEach((latLng) =>
                bounds.extend(latLng)
            ))
        this.polygon = gPolygon
        this.center = bounds.getCenter()
    }

    render() {
        const {sceneAreaId, selectedSceneCount, loading} = this.props
        const zoom = sepalMap.getZoom()
        const scale = Math.min(1, Math.pow(zoom, 2.5) / Math.pow(8, 2.5))
        const size = `${1.5 * 4 * scale}rem`
        const halfSize = `${1.5 * 2 * scale}rem`
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
                    onMouseOver={() => !loading && this.polygon.setMap(googleMap)}
                    onMouseLeave={() => this.polygon.setMap(null)}
                    onClick={() => loading ? null : this.selectScenes(sceneAreaId)}>
                    <circle cx={halfSize} cy={halfSize} r={`${2 * scale}rem`}/>
                    {zoom > 4
                        ? <text x={halfSize} y={halfSize} textAnchor='middle' alignmentBaseline="central">
                            {selectedSceneCount}
                        </text>
                        : null}
                </svg>
            </MapObject>
        )
    }

    selectScenes(sceneAreaId) {
        this.recipe.setSceneSelection(sceneAreaId).dispatch()
    }

}

export default connect(mapStateToProps)(SceneAreaMarker)