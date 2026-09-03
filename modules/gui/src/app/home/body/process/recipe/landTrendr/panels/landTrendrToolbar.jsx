import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {ChartPixelButton} from '~/app/home/body/process/recipe/chartPixelButton'
import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {createCompositeOptions} from '~/app/home/body/process/recipe/opticalMosaic/panels/compositeOptions/compositeOptions'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {RecipeActions} from '../landTrendrRecipe'
import {ChartPixel} from './chartPixel'
import {Dates} from './dates/dates'
import styles from './landTrendrToolbar.module.css'
import {Options} from './options/options'
import {Retrieve} from './retrieve/retrieve'
import {Sources} from './sources/sources'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized')
})

class _LandTrendrToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized} = this.props
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
                <OpticalOptions
                    className={styles.preprocess}
                    title={msg('process.timeSeries.panel.preprocess.title')}
                    forCollection
                />
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <ChartPixelButton
                        disabled={!initialized}
                        tooltipKey='process.landTrendr.chartPixel'
                        onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}/>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.landTrendr.panel.dates.button')}
                        tooltip={msg('process.landTrendr.panel.dates.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.landTrendr.panel.sources.button')}
                        tooltip={msg('process.landTrendr.panel.sources.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.timeSeries.panel.preprocess.button')}
                        tooltip={msg('process.timeSeries.panel.preprocess.tooltip')}
                        panel/>
                    <Toolbar.ActivationButton
                        id='landTrendrOptions'
                        label={msg('process.landTrendr.panel.options.button')}
                        tooltip={msg('process.landTrendr.panel.options.tooltip')}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

const OpticalOptions = createCompositeOptions({
    id: 'options'
})

export const LandTrendrToolbar = compose(
    _LandTrendrToolbar,
    withRecipe(mapRecipeToProps)
)
