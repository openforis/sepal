import React from 'react'

import {Aoi} from '~/app/home/body/process/recipe/aoi'
import {initializeLayers} from '~/app/home/body/process/recipe/recipeImageLayerSource'
import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {classificationReferenceFeedback, classifiedOutputRequirements, collectionClassifierRequirements} from '../collectionClassifierRequirements'
import {withSelectedClassification} from '../selectedClassification'
import {bandPresentation, mapProducts} from './bands'
import {dateRange, defaultModel} from './ccdcRecipe'
import {CcdcToolbar} from './panels/ccdcToolbar'
import {describeSegments$, segmentBandLabels} from './segmentDescription'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _CCDC extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers, defaultGoogleSatellite: true})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <CcdcToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

// The root holds the Classification its Sources select for as long as its tab is open (selectedClassification.js).
const CCDC = compose(
    _CCDC,
    withSelectedClassification({loadError: 'process.ccdc.panel.sources.classificationLoadError'}),
    recipe({defaultModel, mapRecipeToProps})
)

const SOURCES = {id: 'sources', label: 'process.ccdc.panel.sources.button'}

export default () => ({
    id: 'CCDC',
    labels: {
        name: msg('process.ccdc.create'),
        creationDescription: msg('process.ccdc.description'),
        tabPlaceholder: msg('process.ccdc.tabPlaceholder')
    },
    tags: ['TIME_SERIES'],
    components: {
        recipe: CCDC
    },
    sourceRequirements: [
        ...collectionClassifierRequirements(SOURCES),
        classifiedOutputRequirements(SOURCES, 'breakpointBands'),
        classificationReferenceFeedback(SOURCES)
    ],
    imageSource: false,
    geometrySource: true,
    describeSegments$,
    segmentBandLabels,
    getDateRange: recipe => dateRange(recipe.model.dates),
    mapProducts,
    bandPresentation,
    getPreSetVisualizations
})
