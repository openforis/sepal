import {Aoi} from '../aoi'
import {Map} from 'app/home/map/map'
import {RecipeActions} from './ccdcSliceRecipe'
import {SourceSync} from './sourceSync'
import {compose} from 'compose'
import {defaultModel} from './ccdcSliceRecipe'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import CCDCSliceToolbar from './panels/ccdcSliceToolbar'
import React from 'react'
import moment from 'moment'

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
                <CCDCSliceToolbar/>
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