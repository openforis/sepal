import {RecipeState, SceneSelectionType} from '../timeSeriesRecipe'
import {connect} from 'store'
import {msg} from 'translate'
import {withRecipePath} from 'app/home/body/process/recipe'
import Aoi from 'app/home/body/process/mosaic/panels/aoi/aoi'
import Dates from 'app/home/body/process/timeSeries/panels/dates/dates'
import PanelWizard from 'widget/panelWizard'
import Preprocess from 'app/home/body/process/timeSeries/panels/preprocess/preprocess'
import PropTypes from 'prop-types'
import React from 'react'
import Retrieve from 'app/home/body/process/timeSeries/panels/retrieve/retrieve'
import Sources from 'app/home/body/process/timeSeries/panels/sources/sources'
import Toolbar, {PanelButton} from 'widget/toolbar'
import styles from './timeSeriesToolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const {recipeId} = ownProps
    const recipeState = RecipeState(recipeId)
    return {
        initialized: recipeState('ui.initialized')
    }
}

class TimeSeriesToolbar extends React.Component {
    render() {
        const {recipeId, recipePath, initialized, sceneSelectionType, scenesSelected} = this.props
        const statePath = recipePath + '.ui'
        return (
            <PanelWizard
                panels={['areaOfInterest', 'dates', 'sources']}
                statePath={statePath}>
                <Toolbar statePath={statePath} vertical top right className={styles.top}>
                    <PanelButton
                        name='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.timeSeries.panel.retrieve.tooltip')}
                        disabled={!initialized || (sceneSelectionType === SceneSelectionType.SELECT && !scenesSelected)}>
                        <Retrieve recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
                <Toolbar statePath={statePath} vertical bottom right panel className={styles.bottom}>
                    <PanelButton
                        name='areaOfInterest'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}>
                        <Aoi recipeId={recipeId} allowWholeFusionTable={true}/>
                    </PanelButton>
                    <PanelButton
                        name='dates'
                        label={msg('process.timeSeries.panel.dates.button')}
                        tooltip={msg('process.timeSeries.panel.dates.tooltip')}>
                        <Dates recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='sources'
                        label={msg('process.timeSeries.panel.sources.button')}
                        tooltip={msg('process.timeSeries.panel.sources.tooltip')}>
                        <Sources recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='preprocess'
                        label={msg('process.timeSeries.panel.preprocess.button')}
                        tooltip={msg('process.timeSeries.panel.preprocess.tooltip')}>
                        <Preprocess recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
            </PanelWizard>
        )
    }
}

TimeSeriesToolbar.propTypes = {
    recipeId: PropTypes.string
}

export default withRecipePath()(
    connect(mapStateToProps)(TimeSeriesToolbar)
)
