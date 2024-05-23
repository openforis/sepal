import _ from 'lodash'
import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {Options as Preprocess} from '~/app/home/body/process/recipe/baytsHistorical/panels/options/options'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {RecipeActions} from '../baytsAlertsRecipe'
import styles from './baytsAlertsToolbar.module.css'
import {Date} from './date/date'
import {Options} from './options/options'
import {Reference} from './reference/reference'
import {Retrieve} from './retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized')
})

class _BaytsAlertsToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized} = this.props

        return (
            <PanelWizard
                panels={['reference', 'date']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <Reference/>
                <Date/>
                <Preprocess monitor/>
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='reference'
                        label={msg('process.baytsAlerts.panel.reference.button')}
                        tooltip={msg('process.baytsAlerts.panel.reference.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='date'
                        label={msg('process.baytsAlerts.panel.date.button')}
                        tooltip={msg('process.baytsAlerts.panel.date.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.baytsAlerts.panel.preprocess.button')}
                        tooltip={msg('process.baytsAlerts.panel.preprocess.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='baytsAlertsOptions'
                        label={msg('process.baytsAlerts.panel.options.button')}
                        tooltip={msg('process.baytsAlerts.panel.options.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const BaytsAlertsToolbar = compose(
    _BaytsAlertsToolbar,
    withRecipe(mapRecipeToProps)
)

BaytsAlertsToolbar.propTypes = {}
