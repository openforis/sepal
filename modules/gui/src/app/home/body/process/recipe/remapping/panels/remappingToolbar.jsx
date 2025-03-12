import React from 'react'

import {InputImagery} from '~/app/home/body/process/panels/inputImagery/inputImagery'
import {Mapping} from '~/app/home/body/process/panels/mapping/mapping'
import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {Legend} from '../legend/legend'
import styles from './remappingToolbar.module.css'
import {Retrieve} from './retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    collecting: selectFrom(recipe, 'ui.collect.collecting'),
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class _RemappingToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['inputImagery', 'legend', 'mapping']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery/>
                <Legend/>
                <Mapping/>

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
                        id='inputImagery'
                        label={msg('process.panels.inputImagery.button')}
                        tooltip={msg('process.panels.inputImagery.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='legend'
                        label={msg('process.remapping.panel.legend.button')}
                        tooltip={msg('process.remapping.panel.legend.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='mapping'
                        label={msg('process.remapping.panel.mapping.button.label')}
                        tooltip={msg('process.remapping.panel.mapping.button.tooltip')}
                        disabled={!initialized}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const RemappingToolbar = compose(
    _RemappingToolbar,
    withRecipe(mapRecipeToProps)
)

RemappingToolbar.propTypes = {}
