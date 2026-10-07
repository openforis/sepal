import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {withSourceProblems} from '../../selectedSource'
import {RecipeActions} from '../baytsAlertsRecipe'
import styles from './baytsAlertsToolbar.module.css'
import {Date} from './date/date'
import {Options} from './options/options'
import {Preprocess} from './preprocess/preprocess'
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
        const {recipeId, initialized, sourceProblems} = this.props

        return (
            <PanelWizard
                panels={['reference', 'date']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <Reference/>
                <Date/>
                <Preprocess/>
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
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='reference'
                        label={msg('process.baytsAlerts.panel.reference.button')}
                        tooltip={sourceProblems.reference || msg('process.baytsAlerts.panel.reference.tooltip')}
                        error={!!sourceProblems.reference}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='date'
                        label={msg('process.baytsAlerts.panel.date.button')}
                        tooltip={msg('process.baytsAlerts.panel.date.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.baytsAlerts.panel.preprocess.button')}
                        tooltip={sourceProblems.options || msg('process.baytsAlerts.panel.preprocess.tooltip')}
                        error={!!sourceProblems.options}
                        panel/>
                    <Toolbar.ActivationButton
                        id='baytsAlertsOptions'
                        label={msg('process.baytsAlerts.panel.options.button')}
                        tooltip={msg('process.baytsAlerts.panel.options.tooltip')}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const BaytsAlertsToolbar = compose(
    _BaytsAlertsToolbar,
    withSourceProblems(),
    withRecipe(mapRecipeToProps)
)

BaytsAlertsToolbar.propTypes = {}
