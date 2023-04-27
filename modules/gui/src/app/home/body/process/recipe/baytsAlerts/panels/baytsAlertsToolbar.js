import {RecipeActions} from '../baytsAlertsRecipe'
import {Retrieve} from './retrieve/retrieve'
import {RetrieveButton} from '../../retrieveButton'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Date from './date/date'
import Options from './options/options'
import PanelWizard from 'widget/panelWizard'
import Preprocess from 'app/home/body/process/recipe/baytsHistorical/panels/options/options'
import React from 'react'
import Reference from './reference/reference'
import _ from 'lodash'
import styles from './baytsAlertsToolbar.module.css'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    baseBands: selectFrom(recipe, 'model.reference.baseBands')
})

class BaytsAlertsToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized, baseBands} = this.props

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
                    <RetrieveButton disabled={!baseBands} tooltip={msg('process.baytsAlerts.panel.retrieve.tooltip')}/>
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

BaytsAlertsToolbar.propTypes = {}

export default compose(
    BaytsAlertsToolbar,
    withRecipe(mapRecipeToProps)
)
