import _ from 'lodash'
import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {Dates} from '~/app/home/body/process/recipe/ccdc/panels/dates/dates'
import {Retrieve} from '~/app/home/body/process/recipe/ccdc/panels/retrieve/retrieve'
import {Sources} from '~/app/home/body/process/recipe/ccdc/panels/sources/sources'
import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
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
import {RecipeActions} from '../ccdcRecipe'
import styles from './ccdcToolbar.module.css'
import {ChartPixel} from './chartPixel'
import {ChartPixelButton} from './chartPixelButton'
import {Options} from './options/options'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
    sources: selectFrom(recipe, 'model.sources'),
})

class _CcdcToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized, sources} = this.props
        const dataSets = Object.keys(sources.dataSets)
        return (
            <PanelWizard
                panels={['aoi', 'dates', 'sources']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                {initialized ? <ChartPixel/> : null}
                <Retrieve/>
                <Aoi layerIndex={2}/>
                <Dates/>
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
                        label={msg('process.ccdc.panel.dates.button')}
                        tooltip={msg('process.ccdc.panel.dates.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.ccdc.panel.sources.button')}
                        tooltip={msg('process.ccdc.panel.sources.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.ccdc.panel.preprocess.button')}
                        tooltip={msg('process.ccdc.panel.preprocess.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='ccdcOptions'
                        label={msg('process.ccdc.panel.options.button')}
                        tooltip={msg('process.ccdc.panel.options.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

const OpticalOptions = createCompositeOptions({
    id: 'options'
})

export const CcdcToolbar = compose(
    _CcdcToolbar,
    withRecipe(mapRecipeToProps)
)

CcdcToolbar.propTypes = {}
