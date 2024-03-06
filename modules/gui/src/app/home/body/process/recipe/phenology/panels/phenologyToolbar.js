import {Aoi} from 'app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {Dates} from './dates/dates'
import {PreProcessingOptions as OpticalPreprocess} from './preProcessingOptions/preProcessingOptions'
import {PanelWizard} from 'widget/panelWizard'
import {Options as RadarPreprocess} from 'app/home/body/process/recipe/mosaic/panels/radarMosaicOptions/options'
import {Retrieve} from './retrieve/retrieve'
import {RetrieveButton} from '../../retrieveButton'
import {Sources} from './sources/sources'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from '../../../recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import _ from 'lodash'
import styles from './phenologyToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
    sources: selectFrom(recipe, 'model.sources'),
})

class _PhenologyToolbar extends React.Component {
    render() {
        const {recipeId, initialized, sources} = this.props
        return (
            <PanelWizard
                panels={['aoi', 'dates', 'sources']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>

                <Aoi/>
                <Dates/>
                <Sources/>
                {_.isEmpty(sources.dataSets['SENTINEL_1'])
                    ? <OpticalPreprocess/>
                    : <RadarPreprocess/>
                }

                <Toolbar
                    vertical
                    placement='top-right'
                    panel
                    className={styles.top}>
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
                        label={msg('process.phenology.panel.dates.button')}
                        tooltip={msg('process.phenology.panel.dates.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.changeAlerts.panel.sources.button')}
                        tooltip={msg('process.changeAlerts.panel.sources.tooltip')}
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

export const PhenologyToolbar = compose(
    _PhenologyToolbar,
    withRecipe(mapRecipeToProps)
)
