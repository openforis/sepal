import {Aoi} from 'app/home/body/process/recipe/aoi'
import {Map} from 'app/home/map/map'
import {compose} from 'compose'
import {defaultModel} from './assetRecipe'
import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'
import {initializeLayers} from 'app/home/body/process/recipe/recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import AssetToolbar from './panels/assetToolbar'
import React from 'react'
import moment from 'moment'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers'),
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class _Asset extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {aoi, initialized} = this.props
        return (
            <Map>
                <AssetToolbar/>
                {initialized ? <Aoi value={aoi}/> : null}
            </Map>
        )
    }
}

const Asset = compose(
    _Asset,
    recipe({defaultModel, mapRecipeToProps})
)

const getDateRange = recipe => {
    // TODO: Implement - we might not have a date range, and this might not be the shape of it
    const {fromDate, toDate, targetDate} = recipe.model.dates
    const startDate = fromDate || targetDate
    const endDate = toDate || targetDate
    return [moment.utc(startDate, 'YYYY-MM-DD'), moment.utc(endDate, 'YYYY-MM-DD')]
}

export default () => ({
    id: 'ASSET_MOSAIC',
    labels: {
        name: msg('process.asset.create'),
        creationDescription: msg('process.asset.description'),
        tabPlaceholder: msg('process.asset.tabPlaceholder'),
    },
    tags: [],
    components: {
        recipe: Asset
    },
    getDependentRecipeIds: () => [],
    getDateRange,
    getAvailableBands,
    getPreSetVisualizations
})
