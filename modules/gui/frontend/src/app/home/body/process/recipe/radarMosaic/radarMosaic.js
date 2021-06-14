import {Aoi} from '../aoi'
import {Map} from '../../../../map/map'
import {compose} from 'compose'
import {defaultModel} from './radarMosaicRecipe'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import RadarMosaicToolbar from './panels/radarMosaicToolbar'
import React from 'react'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _RadarMosaic extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <RadarMosaicToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

const RadarMosaic = compose(
    _RadarMosaic,
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'RADAR_MOSAIC',
    labels: {
        name: msg('process.radarMosaic.create'),
        creationDescription: msg('process.radarMosaic.description'),
        tabPlaceholder: msg('process.radarMosaic.tabPlaceholder'),
    },
    components: {
        recipe: RadarMosaic
    }
})
