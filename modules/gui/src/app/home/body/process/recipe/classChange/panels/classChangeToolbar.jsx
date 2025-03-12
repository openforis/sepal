import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import styles from './classChangeToolbar.module.css'
import {FromImage} from './inputImage/fromImage'
import {ToImage} from './inputImage/toImage'
import {Legend} from './legend/legend'
import {Options} from './options/options'
import {Retrieve} from './retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized')
})

class _ClassChangeToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['fromImage', 'toImage']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>

                <FromImage/>
                <ToImage/>
                <Legend/>
                <Options/>

                <Toolbar
                    vertical
                    placement="top-right"
                    className={styles.top}>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement="bottom-right"
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id="fromImage"
                        label={msg('process.classChange.panel.inputImage.from.button.label')}
                        tooltip={msg('process.classChange.panel.inputImage.from.button.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id="toImage"
                        label={msg('process.classChange.panel.inputImage.to.button.label')}
                        tooltip={msg('process.classChange.panel.inputImage.to.button.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id="legend"
                        label={msg('process.classChange.panel.legend.button.label')}
                        tooltip={msg('process.classChange.panel.legend.button.tooltip')}
                        panel/>
                    <Toolbar.ActivationButton
                        id="options"
                        label={msg('process.classChange.panel.options.button.label')}
                        tooltip={msg('process.classChange.panel.options.button.tooltip')}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const ClassChangeToolbar = compose(
    _ClassChangeToolbar,
    withRecipe(mapRecipeToProps)
)
