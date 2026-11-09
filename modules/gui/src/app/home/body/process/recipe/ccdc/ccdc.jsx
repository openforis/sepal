import React from 'react'

import {Aoi} from '~/app/home/body/process/recipe/aoi'
import {initializeLayers} from '~/app/home/body/process/recipe/recipeImageLayerSource'
import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {collectionBandRequirements} from '../collectionBandRequirements'
import {classificationReferenceFeedback, classifiedOutputRequirements, collectionClassifierRequirements} from '../collectionClassifierRequirements'
import {dataSetPeriodRequirement} from '../dataSetPeriodRequirement'
import {withSelectedClassification} from '../selectedClassification'
import {bandPresentation, mapProducts} from './bands'
import {dateRange, defaultModel, initialSources} from './ccdcRecipe'
import {CcdcToolbar} from './panels/ccdcToolbar'
import {describeSegments$, segmentBandLabels} from './segmentDescription'
import {tmaskRequirement} from './tmaskRequirement'
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
const OPTIONS = {id: 'ccdcOptions', label: 'process.ccdc.panel.options.button'}

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
        dataSetPeriodRequirement(SOURCES),
        ...collectionClassifierRequirements(SOURCES),
        collectionBandRequirements(SOURCES, 'breakpointBands'),
        classifiedOutputRequirements(SOURCES, 'breakpointBands'),
        classificationReferenceFeedback(SOURCES),
        tmaskRequirement(OPTIONS)
    ],
    initialSources,
    imageSource: false,
    geometrySource: true,
    describeSegments$,
    segmentBandLabels,
    getDateRange: recipe => dateRange(recipe.model.dates),
    mapProducts,
    bandPresentation,
    getPreSetVisualizations
})
