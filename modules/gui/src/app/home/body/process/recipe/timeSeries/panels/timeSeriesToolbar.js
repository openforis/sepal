import {RecipeActions} from '../timeSeriesRecipe'
import {Retrieve} from 'app/home/body/process/recipe/timeSeries/panels/retrieve/retrieve'
import {RetrieveButton} from '../../retrieveButton'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Aoi from 'app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import ChartPixel from './chartPixel'
import ChartPixelButton from '../../ccdc/panels/chartPixelButton'
import Dates from 'app/home/body/process/recipe/timeSeries/panels/dates/dates'
import OpticalOptions from 'app/home/body/process/recipe/timeSeries/panels/preProcessingOptions/preProcessingOptions'
import PanelWizard from 'widget/panelWizard'
import RadarOptions from 'app/home/body/process/recipe/mosaic/panels/radarMosaicOptions/options'
import React from 'react'
import Sources from 'app/home/body/process/recipe/timeSeries/panels/sources/sources'
import _ from 'lodash'
import styles from './timeSeriesToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
    sources: selectFrom(recipe, 'model.sources'),
})

class TimeSeriesToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized, sources} = this.props
        return (
            <PanelWizard
                panels={['aoi', 'dates', 'sources']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                {initialized ? <ChartPixel/> : null}
                <Retrieve/>
                <Aoi/>
                <Dates/>
                <Sources/>
                {_.isEmpty(sources.dataSets['SENTINEL_1'])
                    ? <OpticalOptions/>
                    : <RadarOptions/>
                }

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <ChartPixelButton
                        disabled={!initialized}
                        showGoogleSatellite
                        onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}/>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.timeSeries.panel.dates.button')}
                        tooltip={msg('process.timeSeries.panel.dates.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.timeSeries.panel.sources.button')}
                        tooltip={msg('process.timeSeries.panel.sources.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.timeSeries.panel.preprocess.button')}
                        tooltip={msg('process.timeSeries.panel.preprocess.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

TimeSeriesToolbar.propTypes = {}

export default compose(
    TimeSeriesToolbar,
    withRecipe(mapRecipeToProps)
)
