import {RecipeState} from './changeDetectionRecipe'
import {connect} from 'store'
import {msg} from 'translate'
import {withRecipePath} from 'app/home/body/process/recipe'
import PanelWizard from 'widget/panelWizard'
import PropTypes from 'prop-types'
import React from 'react'
import Retrieve from './retrieve/retrieve'
import Source from './source/source'
import Toolbar, {PanelButton} from 'widget/toolbar'
import TrainingData from './trainingData/trainingData'
import styles from './changeDetectionToolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const {recipeId} = ownProps
    const recipeState = RecipeState(recipeId)
    return {
        initialized: recipeState('ui.initialized')
    }
}

class ChangeDetectionToolbar extends React.Component {
    render() {
        const {recipeId, recipePath, initialized} = this.props
        const statePath = recipePath + '.ui'
        return (
            <PanelWizard
                panels={['source1', 'source2', 'trainingData']}
                statePath={statePath}>
                <Toolbar
                    statePath={statePath}
                    vertical top right
                    className={styles.top}>
                    <PanelButton
                        name='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.changeDetection.panel.retrieve.tooltip')}
                        disabled={!initialized}>
                        <Retrieve recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
                <Toolbar
                    statePath={statePath}
                    vertical bottom right
                    className={styles.bottom}>
                    <PanelButton
                        name='source1'
                        label={msg('process.changeDetection.panel.source1.button')}
                        tooltip={msg('process.changeDetection.panel.source1.tooltip')}>
                        <Source recipeId={recipeId} number={1}/>
                    </PanelButton>
                    <PanelButton
                        name='source2'
                        label={msg('process.changeDetection.panel.source2.button')}
                        tooltip={msg('process.changeDetection.panel.source2.tooltip')}>
                        <Source recipeId={recipeId} number={2}/>
                    </PanelButton>

                    <PanelButton
                        name='trainingData'
                        label={msg('process.changeDetection.panel.trainingData.button')}
                        tooltip={msg('process.changeDetection.panel.trainingData.tooltip')}>
                        <TrainingData recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
            </PanelWizard>
        )
    }
}

ChangeDetectionToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default withRecipePath()(
    connect(mapStateToProps)(ChangeDetectionToolbar)
)
