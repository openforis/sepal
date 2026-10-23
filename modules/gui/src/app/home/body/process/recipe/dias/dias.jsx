import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {bandPresentation} from './bands'
import {defaultModel, getDateRange} from './diasRecipe'
import {DiasToolbar} from './panels/diasToolbar'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _Dias extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <DiasToolbar/>
                <Aoi value={aoi?.type && aoi}/>
            </Map>
        )
    }
}

const Dias = compose(
    _Dias,
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'DIAS',
    labels: {
        name: msg('process.dias.create'),
        creationDescription: msg('process.dias.description'),
        tabPlaceholder: msg('process.dias.tabPlaceholder')
    },
    tags: ['CHANGE', 'ALERTS'],
    components: {
        recipe: Dias
    },
    imageSource: true,
    getDateRange,
    bandPresentation,
    getPreSetVisualizations
})
