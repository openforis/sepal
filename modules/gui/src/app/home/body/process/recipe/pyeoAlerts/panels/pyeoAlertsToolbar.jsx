import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {createCompositeOptions} from '~/app/home/body/process/recipe/opticalMosaic/panels/compositeOptions/compositeOptions'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {Dates} from './dates/dates'
import {Options} from './options/options'
import styles from './pyeoAlertsToolbar.module.css'
import {Retrieve} from './retrieve/retrieve'
import {Sources} from './sources/sources'

// Shared Pre-process ("PRC") panel — NOT forCollection: we build a baseline
// composite and need compose/cloudBuffer/holes/filters editable.
const PreProcess = createCompositeOptions({id: 'options'})

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
    classification: selectFrom(recipe, 'model.sources.classification')
})

class _PyeoAlertsToolbar extends React.Component {
    render() {
        const {recipeId, initialized, classification} = this.props
        return (
            <PanelWizard
                panels={['aoi', 'sources', 'dates']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>

                <Aoi/>
                <Sources/>
                <Dates/>
                <PreProcess title={msg('process.timeSeries.panel.preprocess.title')}/>
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <RetrieveButton disabled={!classification}/>
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
                        id='sources'
                        label={msg('process.pyeoAlerts.panel.sources.button')}
                        tooltip={msg('process.pyeoAlerts.panel.sources.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.pyeoAlerts.panel.dates.button')}
                        tooltip={msg('process.pyeoAlerts.panel.dates.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.timeSeries.panel.preprocess.button')}
                        tooltip={msg('process.timeSeries.panel.preprocess.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='pyeoAlertsOptions'
                        label={msg('process.pyeoAlerts.panel.options.button')}
                        tooltip={msg('process.pyeoAlerts.panel.options.tooltip')}
                        disabled={!initialized}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const PyeoAlertsToolbar = compose(
    _PyeoAlertsToolbar,
    withRecipe(mapRecipeToProps)
)
