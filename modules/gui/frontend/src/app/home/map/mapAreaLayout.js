import {MapControls} from './mapControls'
import {SplitOverlay} from 'widget/splitContent'
import {compose} from 'compose'
import {selectFrom} from '../../../stateUtils'
import {updateFeatureLayers} from './featureLayers'
import {withMapAreaContext} from './mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'

const mapRecipeToProps = recipe => ({recipe})

class _MapAreaLayout extends React.Component {
    render() {
        const {mapAreaContext: {area}, form} = this.props
        return (
            <React.Fragment>
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
        const selectedLayers = selectFrom(recipe, ['layers.areas', area, 'featureLayers'])
        updateFeatureLayers({map, recipe, selectedLayers})
    }

}

export const MapAreaLayout = compose(
    _MapAreaLayout,
    withRecipe(mapRecipeToProps),
    withMapAreaContext()
)

MapAreaLayout.propTypes = {
    form: PropTypes.object,
    layer: PropTypes.object,
    map: PropTypes.object
}
