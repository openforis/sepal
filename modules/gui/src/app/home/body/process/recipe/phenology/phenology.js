import {Aoi} from '~/app/home/body/process/recipe/aoi'
import {Map} from '~/app/home/map/map'
import {PhenologyToolbar} from './panels/phenologyToolbar'
import {compose} from '~/compose'
import {defaultModel} from './phenologyRecipe'
import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'
import {initializeLayers} from '~/app/home/body/process/recipe/recipeImageLayerSource'
import {msg} from '~/translate'
import {recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import React from 'react'
import moment from 'moment'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _Phenology extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <PhenologyToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

const Phenology = compose(
    _Phenology,
    recipe({defaultModel, mapRecipeToProps})
)

const getDateRange = recipe => {
    const {fromYear, toYear} = recipe.model.dates
    return [moment.utc(fromYear, 'YYYY'), moment.utc(toYear, 'YYYY')]
}

export default () => ({
    id: 'PHENOLOGY',
    labels: {
        name: msg('process.phenology.create'),
        creationDescription: msg('process.phenology.description'),
        tabPlaceholder: msg('process.phenology.tabPlaceholder'),
    },
    components: {
        recipe: Phenology
    },
    getDependentRecipeIds: _recipe => [],
    getDateRange,
    getAvailableBands,
    getPreSetVisualizations,
    beta: true
})
