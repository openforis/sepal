import moment from 'moment'
import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {defaultModel, RecipeActions} from './ccdcSliceRecipe'
import {CcdcSliceToolbar} from './panels/ccdcSliceToolbar'
import {SourceSync} from './sourceSync'

const mapRecipeToProps = recipe => ({
    source: selectFrom(recipe, 'model.source'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _CcdcSlice extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {source} = this.props
        return (
            <Map>
                <CcdcSliceToolbar/>
                <Aoi value={source.type && source}/>
                <SourceSync/>
            </Map>
        )
    }

}

const CcdcSlice = compose(
    _CcdcSlice,
    recipe({defaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe => {
    const {type, id} = selectFrom(recipe, 'model.source') || {}
    return type === 'RECIPE_REF' ? [id] : []
}

export default () => ({
    id: 'CCDC_SLICE',
    labels: {
        name: msg('process.ccdcSlice.create'),
        creationDescription: msg('process.ccdcSlice.description'),
        tabPlaceholder: msg('process.ccdcSlice.tabPlaceholder')
    },
    tags: ['TIME_SERIES'],
    components: {
        recipe: CcdcSlice
    },
    getDependentRecipeIds,
    getDateRange(recipe) {
        const date = moment.utc(recipe.model.date.date, 'YYYY-MM-DD')
        return [date, date]
    },
    getAvailableBands: recipe => selectFrom(recipe, 'model.source.bands') || [],
    getPreSetVisualizations: recipe => selectFrom(recipe, 'model.source.visualizations') || []
})
