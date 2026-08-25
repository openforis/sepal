import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {getAvailableBands} from './bands'
import {defaultModel, getDateRange, RecipeActions} from './diasRecipe'
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
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <DiasToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

const Dias = compose(
    _Dias,
    recipe({defaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe => {
    const {type, id} = selectFrom(recipe, 'model.forestMask') || {}
    return type === 'RECIPE_REF' ? [id] : []
}

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
    getDependentRecipeIds,
    getDateRange,
    getAvailableBands,
    getPreSetVisualizations
})
