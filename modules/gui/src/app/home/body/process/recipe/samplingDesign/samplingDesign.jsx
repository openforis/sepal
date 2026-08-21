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
import {calculationCache} from './sampling/calculationCache'
import {getDefaultModel} from './sampling/defaultModel'
import {normalizeSavedLayers, RecipeActions} from './samplingDesignRecipe'
import {Sync} from './sync'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    classificationRecipeId: selectFrom(recipe, 'model.sources.classification'),
    classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _SamplingDesign extends React.Component {
    // Owned here rather than in the panels, because a panel is mounted only while it is open: caching there
    // would throw away an expensive Earth Engine result every time the user closed the panel. An unselected
    // recipe tab stays mounted, so these survive switching tabs, while closing the tab discards them - which
    // is also the freshness boundary for an asset overwritten at the same id. Plain instance fields: a cache
    // write changes nothing that renders, so it must not provoke one.
    areaCache = calculationCache()
    probabilityCache = calculationCache()

    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        // Sampling Design has no image output, so there's no "This Recipe" image layer - default to the
        // Google Satellite basemap. Sampling Design is export-only; a completed export is added as a
        // generic EE table overlay.
        initializeLayers({
            recipeId,
            savedLayers: normalizeSavedLayers(savedLayers),
            skipThis: true,
            defaultGoogleSatellite: true
        })
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <Sync/>
                <SamplingDesignToolbar
                    areaCache={this.areaCache}
                    probabilityCache={this.probabilityCache}
                />
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

const SamplingDesign = compose(
    _SamplingDesign,
    recipe({getDefaultModel, mapRecipeToProps}),
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
