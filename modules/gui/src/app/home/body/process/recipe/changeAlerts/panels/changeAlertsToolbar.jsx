import _ from 'lodash'
import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {ChartPixelButton} from '~/app/home/body/process/recipe/chartPixelButton'
import {Options as RadarOptions} from '~/app/home/body/process/recipe/mosaic/panels/radarMosaicOptions/options'
import {createCompositeOptions} from '~/app/home/body/process/recipe/opticalMosaic/panels/compositeOptions/compositeOptions'
import {Options as PlanetOptions} from '~/app/home/body/process/recipe/planetMosaic/panels/options/options'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {withSourceProblems} from '../../selectedSource'
import {RecipeActions} from '../changeAlertsRecipe'
import {hasSegmentDescription} from '../referenceEvidence'
import styles from './changeAlertsToolbar.module.css'
import {ChartPixel} from './chartPixel'
import {Date} from './date/date'
import {Options} from './options/options'
import {Reference} from './reference/reference'
import {Retrieve} from './retrieve/retrieve'
import {Sources} from './sources/sources'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    describedSource: hasSegmentDescription(recipe),
    sources: selectFrom(recipe, 'model.sources'),
})

class _ChangeAlertsToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized, describedSource, sources, sourceProblems} = this.props
        const dataSets = Object.keys(sources.dataSets)
        return (
            <PanelWizard
                panels={['reference', 'date', 'sources']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                {initialized && describedSource ? <ChartPixel/> : null}
                <Retrieve/>
                <Reference/>
                <Date/>
                <Sources/>
                {dataSets.includes('SENTINEL_1')
                    ? <RadarOptions/>
                    : dataSets.includes('PLANET')
                        ? <PlanetOptions
                            title={msg('process.timeSeries.panel.preprocess.title')}
                            source={sources.dataSets['PLANET'][0]}
                            forCollection
                        />
                        : <OpticalOptions
                            title={msg('process.timeSeries.panel.preprocess.title')}
                            forCollection
                        />
                }
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <ChartPixelButton
                        disabled={!initialized || !describedSource}
                        onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}
                    />
                    <RetrieveButton disabled={!describedSource} tooltip={msg('process.changeAlerts.panel.retrieve.tooltip')}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='reference'
                        label={msg('process.changeAlerts.panel.reference.button')}
                        tooltip={sourceProblems.reference || msg('process.changeAlerts.panel.reference.tooltip')}
                        error={!!sourceProblems.reference}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='date'
                        label={msg('process.changeAlerts.panel.date.button')}
                        tooltip={msg('process.changeAlerts.panel.date.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.changeAlerts.panel.sources.button')}
                        tooltip={sourceProblems.sources || msg('process.changeAlerts.panel.sources.tooltip')}
                        error={!!sourceProblems.sources}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.timeSeries.panel.preprocess.button')}
                        tooltip={msg('process.timeSeries.panel.preprocess.tooltip')}
                        panel/>
                    <Toolbar.ActivationButton
                        id='changeAlertsOptions'
                        label={msg('process.changeAlerts.panel.options.button')}
                        tooltip={msg('process.changeAlerts.panel.options.tooltip')}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

const OpticalOptions = createCompositeOptions({
    id: 'options'
})

export const ChangeAlertsToolbar = compose(
    _ChangeAlertsToolbar,
    withSourceProblems(),
    withRecipe(mapRecipeToProps)
)
    
ChangeAlertsToolbar.propTypes = {}
