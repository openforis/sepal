import React from 'react'

import {PROPORTIONS_IMAGE, STRATIFICATION} from '#sepal/recipe/type/samplingDesign'
import {recipe} from '~/app/home/body/process/recipeContext'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {recipeAccess} from '../../recipeAccess'
import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {samplingDesignCalculations} from './calculations'
import {samplingDesignDerivations} from './derivations'
import {SAMPLES, samplingDesignRequirements} from './freshnessRequirements'
import {SamplingDesignToolbar} from './panels/samplingDesignToolbar'
import {getDefaultModel} from './sampling/defaultModel'
import {normalizeSavedLayers, RecipeActions} from './samplingDesignRecipe'
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
                <SamplingDesignToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }

    // An unselected recipe tab stays mounted, so the stratum frame's current evidence is kept while the design is open
    // anywhere, with or without a panel (calculationEvidence.js). Reading it starts no calculation.
    componentDidMount() {
        const {recipeId, sourceRuntime} = this.props
        this.dependencyEvidence = sourceRuntime?.watchDependencyEvidence$(recipeId).subscribe()
    }

    componentWillUnmount() {
        this.dependencyEvidence?.unsubscribe()
    }
}

const SamplingDesign = compose(
    _SamplingDesign,
    recipe({getDefaultModel, mapRecipeToProps}),
    recipeAccess(),
    withSourceRuntime()
)

export default () => ({
    id: 'SAMPLING_DESIGN',
    // The images it reads that the layout shows (mapLayout/dependencyLayerSources.js).
    dependencyLayerRoles: [STRATIFICATION, PROPORTIONS_IMAGE],
    labels: {
        name: msg('process.samplingDesign.create'),
        creationDescription: msg('process.samplingDesign.description'),
        tabPlaceholder: msg('process.samplingDesign.tabPlaceholder')
    },
    tags: [],
    components: {
        recipe: SamplingDesign
    },
    imageSource: false,
    sourceRequirements: samplingDesignRequirements,
    calculatedResults: samplingDesignCalculations,
    derivedResults: samplingDesignDerivations,
    retrieveOperation: SAMPLES,
    getDateRange: () => undefined,
    getPreSetVisualizations
})
