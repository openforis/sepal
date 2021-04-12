import {MapControls} from './mapControls'
import {SplitOverlay} from 'widget/splitContent'
import {compose} from 'compose'
import {createFeatureLayer} from './featureLayerFactory'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from './mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapAreaLayout.module.css'

const mapRecipeToProps = recipe => ({recipe})

class _MapAreaLayout extends React.Component {
    render() {
        const {mapAreaContext: {area, refCallback}, form} = this.props
        return (
            <React.Fragment>
                <div
                    className={[styles.split, styles[area]].join(' ')}
                    data-area={area}
                    data-test={`foo-bar-${area}`}
                    ref={refCallback}
                />
                <SplitOverlay area={area}>
                    <MapControls area={area} form={form}/>
                </SplitOverlay>
            </React.Fragment>
        )
    }

    componentDidUpdate() {
        const {layer, map, recipe, mapAreaContext: {area}} = this.props
        if (!map) {
            return
        }
        const imageLayerId = 'imageLayer'
        if (layer) {
            map.setLayer({id: imageLayerId, layer})
        } else {
            map.removeLayer(imageLayerId)
        }
        const featureLayerSources = selectFrom(recipe, 'ui.featureLayerSources') || []
        const selectedFeatureLayerSourceIds = recipe.layers.areas[area].featureLayers.map(({sourceId}) => sourceId)
        featureLayerSources.forEach((featureLayerSource, i) => {
            const isSelected = selectedFeatureLayerSourceIds.includes(featureLayerSource.id)

            if (isSelected) {
                this.addFeatureLayer(featureLayerSource, i + 1)
            } else {
                map.removeLayer(featureLayerSource.type)
            }
        })
    }

    addFeatureLayer(featureLayerSource, layerIndex) {
        const {map, recipe} = this.props
        const layer = createFeatureLayer({
            featureLayerSource,
            map,
            recipe,
            layerIndex
        })
        if (layer) {
            map.setLayer({id: featureLayerSource.type, layer})
        }
    }
}

export const MapAreaLayout = compose(
    _MapAreaLayout,
    withRecipe(mapRecipeToProps),
    withMapAreaContext(),
)

MapAreaLayout.propTypes = {
    form: PropTypes.object,
    layer: PropTypes.object,
    map: PropTypes.object
}
