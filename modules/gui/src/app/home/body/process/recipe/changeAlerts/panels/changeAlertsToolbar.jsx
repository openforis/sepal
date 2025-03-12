import _ from 'lodash'
import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {Options as RadarOptions} from '~/app/home/body/process/recipe/mosaic/panels/radarMosaicOptions/options'
import {createCompositeOptions} from '~/app/home/body/process/recipe/opticalMosaic/panels/compositeOptions/compositeOptions'
import {Options as PlanetOptions} from '~/app/home/body/process/recipe/planetMosaic/panels/options/options'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {ChartPixelButton} from '../../ccdc/panels/chartPixelButton'
import {RetrieveButton} from '../../retrieveButton'
import {RecipeActions} from '../changeAlertsRecipe'
import styles from './changeAlertsToolbar.module.css'
import {ChartPixel} from './chartPixel'
import {Date} from './date/date'
import {Options} from './options/options'
import {Reference} from './reference/reference'
import {Retrieve} from './retrieve/retrieve'
import {Sources} from './sources/sources'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    baseBands: selectFrom(recipe, 'model.reference.baseBands'),
    sources: selectFrom(recipe, 'model.sources'),
})

class _ChangeAlertsToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized, baseBands, sources} = this.props
        const dataSets = Object.keys(sources.dataSets)
        return (
            <PanelWizard
                panels={['reference', 'date', 'sources']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                {initialized && baseBands ? <ChartPixel/> : null}
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
                        disabled={!initialized || !baseBands}
                        onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}
                    />
                    <RetrieveButton disabled={!baseBands} tooltip={msg('process.changeAlerts.panel.retrieve.tooltip')}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='reference'
                        label={msg('process.changeAlerts.panel.reference.button')}
                        tooltip={msg('process.changeAlerts.panel.reference.tooltip')}
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
                        tooltip={msg('process.changeAlerts.panel.sources.tooltip')}
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
    withRecipe(mapRecipeToProps)
)
    
ChangeAlertsToolbar.propTypes = {}
