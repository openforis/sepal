import {Legend} from '../legend/legend'
import {RecipeActions} from '../remappingRecipe'
import {Retrieve} from './retrieve/retrieve'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import InputImagery from './inputImagery/inputImagery'
import PanelWizard from 'widget/panelWizard'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './remappingToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    collecting: selectFrom(recipe, 'ui.collect.collecting'),
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class RemappingToolbar extends React.Component {
    render() {
        const {recipeId, collecting, initialized} = this.props
        return (
            <PanelWizard
                panels={['inputImagery', 'legend']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery/>
                <Legend/>

                <Toolbar
                    vertical
                    placement='top-right'
                    panel
                    className={styles.top}>
                    <Toolbar.ToolbarButton
                        selected={collecting}
                        onClick={() => RecipeActions(recipeId).setCollecting(!collecting)}
                        icon={'map-marker'}
                        tooltip={msg(collecting
                            ? 'process.remapping.collect.disable.tooltip'
                            : 'process.remapping.collect.enable.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.retrieve.tooltip')}
                        disabled={!initialized}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='inputImagery'
                        label={msg('process.remapping.panel.inputImagery.button')}
                        tooltip={msg('process.remapping.panel.inputImagery.tooltip')}/>

                    <Toolbar.ActivationButton
                        id='legend'
                        label={msg('process.remapping.panel.legend.button')}
                        tooltip={msg('process.remapping.panel.legend.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

RemappingToolbar.propTypes = {
    dataCollectionManager: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
}

export default compose(
    RemappingToolbar,
    withRecipe(mapRecipeToProps)
)
