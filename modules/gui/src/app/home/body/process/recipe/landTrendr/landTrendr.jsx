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
import {defaultModel} from './landTrendrRecipe'
import {LandTrendrToolbar} from './panels/landTrendrToolbar'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _LandTrendr extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <LandTrendrToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

const LandTrendr = compose(
    _LandTrendr,
    recipe({defaultModel, mapRecipeToProps})
)

const getDateRange = recipe => {
    const {startYear, endYear} = recipe.model.dates
    return [moment.utc(startYear, 'YYYY'), moment.utc(endYear, 'YYYY').endOf('year')]
}

export default () => ({
    id: 'LANDTRENDR',
    labels: {
        name: msg('process.landTrendr.create'),
        creationDescription: msg('process.landTrendr.description'),
        tabPlaceholder: msg('process.landTrendr.tabPlaceholder')
    },
    tags: ['TIME_SERIES', 'CHANGE'],
    components: {
        recipe: LandTrendr
    },
    getDependentRecipeIds: _recipe => [],
    getDateRange,
    getAvailableBands,
    getPreSetVisualizations
})
