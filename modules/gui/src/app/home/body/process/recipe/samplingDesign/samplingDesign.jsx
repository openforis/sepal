import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {recipeAccess} from '../../recipeAccess'
import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {getAvailableBands} from './bands'
import {SamplingDesignToolbar} from './panels/samplingDesignToolbar'
import {defaultModel, RecipeActions} from './samplingDesignRecipe'
import {Sync} from './sync'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    classificationRecipeId: selectFrom(recipe, 'model.sources.classification'),
    classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _SamplingDesign extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        initializeLayers({recipeId, savedLayers, defaultGoogleSatellite: true})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <Sync/>
                <SamplingDesignToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

const SamplingDesign = compose(
    _SamplingDesign,
    recipe({defaultModel, mapRecipeToProps}),
    recipeAccess()
)

const getDependentRecipeIds = recipe => {
    const classification = selectFrom(recipe, 'model.sources.classification')
    return classification ? [classification] : []
}

export default () => ({
    id: 'SAMPLING_DESIGN',
    labels: {
        name: msg('process.samplingDesign.create'),
        creationDescription: msg('process.samplingDesign.description'),
        tabPlaceholder: msg('process.samplingDesign.tabPlaceholder')
    },
    tags: [],
    components: {
        recipe: SamplingDesign
    },
    noImageOutput: true,
    getDependentRecipeIds,
    getDateRange: () => undefined,
    getAvailableBands,
    getPreSetVisualizations
})
