import Aoi from 'app/home/body/process/mosaic/panels/aoi/aoi'
import Options from 'app/home/body/process/radarMosaic/options/options'
import {setInitialized} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Dates from 'app/home/body/process/timeSeries/panels/dates/dates'
import PreProcessingOptions from 'app/home/body/process/timeSeries/panels/preProcessingOptions/preProcessingOptions'
import Retrieve from 'app/home/body/process/timeSeries/panels/retrieve/retrieve'
import Sources from 'app/home/body/process/timeSeries/panels/sources/sources'
import {compose} from 'compose'
import _ from 'lodash'
import React from 'react'
import {selectFrom} from 'stateUtils'
import {msg} from 'translate'
import PanelWizard from 'widget/panelWizard'
import {Toolbar} from 'widget/toolbar/toolbar'
import styles from './timeSeriesToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
    sources: selectFrom(recipe, 'model.sources'),
})

class TimeSeriesToolbar extends React.Component {
    render() {
        const {recipeId, initialized, sources} = this.props
        return (
            <PanelWizard
                panels={['aoi', 'dates', 'sources']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>
                <Aoi allowWholeEETable={true}/>
                <Dates/>
                <Sources/>
                {_.isEmpty(sources['SENTINEL_1'])
                    ? <PreProcessingOptions/>
                    : <Options/>
                }


                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <Toolbar.ActivationButton
                        id='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.timeSeries.panel.retrieve.tooltip')}
                        disabled={!initialized}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.timeSeries.panel.dates.button')}
                        tooltip={msg('process.timeSeries.panel.dates.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.timeSeries.panel.sources.button')}
                        tooltip={msg('process.timeSeries.panel.sources.tooltip')}/>
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
