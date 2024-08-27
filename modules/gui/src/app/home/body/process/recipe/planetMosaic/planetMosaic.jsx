import moment from 'moment'
import React from 'react'

import {Aoi} from '~/app/home/body/process/recipe/aoi'
import {initializeLayers} from '~/app/home/body/process/recipe/recipeImageLayerSource'
import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {getAvailableBands} from './bands'
import {PlanetMosaicToolbar} from './panels/planetMosaicToolbar'
import {defaultModel} from './planetMosaicRecipe'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _PlanetMosaic extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <PlanetMosaicToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

const PlanetMosaic = compose(
    _PlanetMosaic,
    recipe({defaultModel, mapRecipeToProps})
)

const getDateRange = recipe => {
    const {fromDate, toDate, targetDate} = recipe.model.dates
    const startDate = fromDate || targetDate
    const endDate = toDate || targetDate
    return [moment.utc(startDate, 'YYYY-MM-DD'), moment.utc(endDate, 'YYYY-MM-DD')]
}

export default () => ({
    id: 'PLANET_MOSAIC',
    labels: {
        name: msg('process.planetMosaic.create'),
        creationDescription: msg('process.planetMosaic.description'),
        tabPlaceholder: msg('process.planetMosaic.tabPlaceholder'),
    },
    tags: ['MOSAIC'],
    components: {
        recipe: PlanetMosaic
    },
    getDependentRecipeIds: _recipe => [],
    getDateRange,
    getAvailableBands,
    getPreSetVisualizations
})
