import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {google, googleMap, MapObject} from 'app/home/map/map'
import {selectFrom} from 'collections'
import React from 'react'
import {select} from 'store'
import {activator} from 'widget/activation/activator'
import styles from './sceneAreas.module.css'

const mapRecipeToProps = (recipe, ownProps) => {
    const {sceneAreaId} = ownProps
    const selectedScenes = selectFrom(recipe, ['model.scenes', sceneAreaId]) || []
    return {
        recipeId: recipe.id,
        selectedSceneCount: selectedScenes.length,
        loading: selectFrom(recipe, 'ui.autoSelectingScenes'),
        zoom: select('map.zoom') || googleMap.getZoom()
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

    renderSceneAreaCount(zoom, fontSize, count) {
        return zoom > 4
            ? <text x={0} y={0} fontSize={fontSize} textAnchor='middle' dominantBaseline='middle'>{count}</text>
            : null
    }

    render() {
        const {zoom, sceneAreaId, selectedSceneCount, loading} = this.props
        const scale = Math.min(1, Math.pow(zoom, 2.5) / Math.pow(8, 2.5))
        const size = `${1.5 * 4 * scale}em`
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
                    {this.renderSceneAreaCount(zoom, 20 + 20 / scale, selectedSceneCount)}
                </svg>
            </MapObject>
        )
    }

    selectScenes(sceneAreaId) {
        const {activate} = this.props
        this.recipeActions.setSceneSelection(sceneAreaId).dispatch()
        activate()

    }

}

export default withRecipe(mapRecipeToProps)(
    activator('sceneSelection')(
        SceneAreaMarker
    )
)
