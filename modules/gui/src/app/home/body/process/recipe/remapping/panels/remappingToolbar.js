import {InputImagery} from './inputImagery/inputImagery'
import {Legend} from '../legend/legend'
import {Mapping} from './mapping/mapping'
import {PanelWizard} from '~/widget/panelWizard'
import {Retrieve} from './retrieve/retrieve'
import {RetrieveButton} from '../../retrieveButton'
import {Toolbar} from '~/widget/toolbar/toolbar'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './remappingToolbar.module.css'

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
                    panel
                    className={styles.top}>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='inputImagery'
                        label={msg('process.remapping.panel.inputImagery.button')}
                        tooltip={msg('process.remapping.panel.inputImagery.tooltip')}
                        disabled={!initialized}/>

                    <Toolbar.ActivationButton
                        id='legend'
                        label={msg('process.remapping.panel.legend.button')}
                        tooltip={msg('process.remapping.panel.legend.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='mapping'
                        label={msg('process.remapping.panel.mapping.button.label')}
                        tooltip={msg('process.remapping.panel.mapping.button.tooltip')}
                        disabled={!initialized}/>
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
