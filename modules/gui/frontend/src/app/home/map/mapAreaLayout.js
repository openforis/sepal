import {FeatureLayers} from './featureLayers'
import {MapControls} from './mapControls'
import {SplitOverlay} from 'widget/split/splitOverlay'
import {compose} from 'compose'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from './mapAreaContext'
import {withRecipe} from '../body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'

const mapRecipeToProps = recipe => ({
    areas: selectFrom(recipe, ['layers.areas'])
})

class _MapAreaLayout extends React.Component {
    render() {
        const {mapAreaContext: {area}, form, map, areas} = this.props
        const selectedLayers = areas[area].featureLayers
        return (
            <React.Fragment>
                <SplitOverlay area={area}>
                    <MapControls area={area} form={form}/>
                    <FeatureLayers selectedLayers={selectedLayers} map={map}/>
                </SplitOverlay>
            </React.Fragment>
        )
    }

    componentDidUpdate() {
        const {layer, map} = this.props
        if (!map) {
            return
        }
        const imageLayerId = 'imageLayer'
        if (layer) {
            map.setLayer({id: imageLayerId, layer})
        } else {
            map.removeLayer(imageLayerId)
        }
    }

}

export const MapAreaLayout = compose(
    _MapAreaLayout,
    withMapAreaContext(),
    withRecipe(mapRecipeToProps),
)

MapAreaLayout.propTypes = {
    form: PropTypes.object,
    layer: PropTypes.object,
    map: PropTypes.object
}
