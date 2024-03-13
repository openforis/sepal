import {FeatureLayers} from './featureLayers'
import {MapAreaMenu} from './mapAreaMenu'
import {SplitOverlay} from '~/widget/split/splitOverlay'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {withLayers} from '../body/process/withLayers'
import {withMapArea} from './mapAreaContext'
import {withRecipe} from '../body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const mapRecipeToProps = recipe => ({
    areas: selectFrom(recipe, ['layers.areas'])
})

const LAYER_ID = 'imageLayer'

class _MapAreaLayout extends React.Component {
    render() {
        const {mapArea: {area}, form, map, areas} = this.props
        
        return (
            <SplitOverlay area={area}>
                <MapAreaMenu area={area} form={form}/>
                <FeatureLayers featureLayers={areas[area].featureLayers} map={map}/>
            </SplitOverlay>
        )
    }
    componentDidMount() {
        this.updateFeatureLayers()
    }

    componentDidUpdate() {
        const {layer, map} = this.props
        if (!map) {
            return
        }
        this.updateFeatureLayers()
        if (layer) {
            map.setLayer({id: LAYER_ID, layer})
        } else {
            map.removeLayer(LAYER_ID)
        }
    }

    componentWillUnmount() {
        const {layer, map} = this.props
        if (layer) {
            map.removeLayer(LAYER_ID)
        }
    }

    updateFeatureLayers() {
        const {recipeActionBuilder, featureLayerSources, mapArea: {area}, areas} = this.props
        const featureLayers = areas[area].featureLayers
        const nextFeatureLayers = featureLayerSources.map(({id, defaultEnabled}) =>
            featureLayers.find(({sourceId}) => sourceId === id)
                || {sourceId: id, disabled: !defaultEnabled}
        )
        if (!_.isEqual(featureLayers, nextFeatureLayers)) {
            recipeActionBuilder('SET_FEATURE_LAYERS', {sourceIds: nextFeatureLayers, area})
                .set(['layers.areas', area, 'featureLayers'], nextFeatureLayers)
                .dispatch()
        }
    }
}

export const MapAreaLayout = compose(
    _MapAreaLayout,
    withRecipe(mapRecipeToProps),
    withMapArea(),
    withLayers()
)

MapAreaLayout.propTypes = {
    form: PropTypes.object,
    layer: PropTypes.object,
    map: PropTypes.object
}
