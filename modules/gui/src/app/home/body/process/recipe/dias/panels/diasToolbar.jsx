import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {ChartPixelButton} from '~/app/home/body/process/recipe/chartPixelButton'
import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {RecipeActions} from '../diasRecipe'
import {ChartPixel} from './chartPixel/chartPixel'
import {Dates} from './dates/dates'
import styles from './diasToolbar.module.css'
import {ForestMask} from './forestMask/forestMask'
import {Options} from './options/options'
import {Retrieve} from './retrieve/retrieve'
import {Sources} from './sources/sources'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized')
})

class _DiasToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['aoi', 'dates', 'sources', 'forestMask']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                {initialized ? <ChartPixel/> : null}
                <Retrieve/>

                <Aoi/>
                <Dates/>
                <Sources/>
                <ForestMask/>
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <ChartPixelButton
                        disabled={!initialized}
                        tooltipKey='process.dias.chartPixel'
                        onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}/>
                    <RetrieveButton tooltip={msg('process.dias.panel.retrieve.tooltip')}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.dias.panel.aoi.button')}
                        tooltip={msg('process.dias.panel.aoi.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.dias.panel.dates.button')}
                        tooltip={msg('process.dias.panel.dates.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.dias.panel.sources.button')}
                        tooltip={msg('process.dias.panel.sources.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='forestMask'
                        label={msg('process.dias.panel.forestMask.button')}
                        tooltip={msg('process.dias.panel.forestMask.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='diasOptions'
                        label={msg('process.dias.panel.options.button')}
                        tooltip={msg('process.dias.panel.options.tooltip')}
                        disabled={!initialized}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const DiasToolbar = compose(
    _DiasToolbar,
    withRecipe(mapRecipeToProps)
)

DiasToolbar.propTypes = {}
