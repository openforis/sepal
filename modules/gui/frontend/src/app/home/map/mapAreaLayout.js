import {MapControls} from './mapControls'
import {SplitOverlay} from 'widget/splitContent'
import {compose} from 'compose'
import {createFeatureLayer} from './featureLayerFactory'
import {withMapAreaContext} from './mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './mapAreaLayout.module.css'

const mapRecipeToProps = recipe => ({
    recipe: _.omit(recipe, 'ui')
})

class _MapAreaLayout extends React.Component {
    render() {
        const {mapAreaContext: {area, refCallback}} = this.props
        return (
            <React.Fragment>
                <div
                    className={[styles.split, styles[area]].join(' ')}
                    data-area={area}
                    ref={refCallback}
                />
                <SplitOverlay area={area}>
                    <MapControls area={area}/>
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
        recipe.layers[area].featureLayers
            .forEach(({type}, i) => {
                const layer = createFeatureLayer({
                    type,
                    map,
                    recipe,
                    layerIndex: i + 1
                })
                if (layer) {
                    map.setLayer({id: type, layer})
                }
            })
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
