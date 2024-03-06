import {Aoi} from '../aoi'
import {IndexChangeToolbar} from './panels/indexChangeToolbar'
import {Map} from 'app/home/map/map'
import {compose} from 'compose'
import {defaultModel} from './indexChangeRecipe'
import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'
import {initializeLayers} from 'app/home/body/process/recipe/recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import React from 'react'
import moment from 'moment'

const mapRecipeToProps = recipe => ({
    fromImage: selectFrom(recipe, 'model.fromImage'),
    toImage: selectFrom(recipe, 'model.toImage'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _IndexChange extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {fromImage, toImage} = this.props
        return (
            <Map>
                <IndexChangeToolbar/>
                <Aoi value={fromImage || toImage}/>
            </Map>
        )
    }
}

const IndexChange = compose(
    _IndexChange,
    recipe({defaultModel, mapRecipeToProps})
)

const getDateRange = recipe => {
    const {fromDate, toDate, targetDate} = recipe.model.dates
    const startDate = fromDate || targetDate
    const endDate = toDate || targetDate
    return [moment.utc(startDate, 'YYYY-MM-DD'), moment.utc(endDate, 'YYYY-MM-DD')]
}

const getDependentRecipeIds = recipe =>
    [
        (selectFrom(recipe, 'model.fromImage') || {}),
        (selectFrom(recipe, 'model.toImage') || {}),
    ]
        .filter(({type}) => type === 'RECIPE_REF')
        .map(({id}) => id)

export default () => ({
    id: 'INDEX_CHANGE',
    labels: {
        name: msg('process.indexChange.create'),
        creationDescription: msg('process.indexChange.description'),
        tabPlaceholder: msg('process.indexChange.tabPlaceholder'),
    },
    tags: ['CHANGE'],
    components: {
        recipe: IndexChange
    },
    getDependentRecipeIds,
    getDateRange,
    getAvailableBands,
    getPreSetVisualizations
})
