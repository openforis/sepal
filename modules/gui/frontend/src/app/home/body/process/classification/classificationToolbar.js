import {RecipeState} from './classificationRecipe'
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
import styles from './classificationToolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const {recipeId} = ownProps
    const recipeState = RecipeState(recipeId)
    return {
        initialized: recipeState('ui.initialized')
    }
}

class ClassificationToolbar extends React.Component {
    render() {
        const {recipeId, recipePath, initialized} = this.props
        const statePath = recipePath + '.ui'
        return (
            <PanelWizard
                panels={['mosaic', 'trainingData']}
                statePath={statePath}>
                <Toolbar
                    statePath={statePath}
                    vertical top right
                    className={styles.top}>
                    <PanelButton
                        name='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.classification.panel.retrieve.tooltip')}
                        disabled={!initialized}>
                        <Retrieve recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
                <Toolbar
                    statePath={statePath}
                    vertical bottom right
                    className={styles.bottom}>
                    <PanelButton
                        name='mosaic'
                        label={msg('process.classification.panel.source.button')}
                        tooltip={msg('process.classification.panel.source.tooltip')}>
                        <Source recipeId={recipeId}/>
                    </PanelButton>

                    <PanelButton
                        name='trainingData'
                        label={msg('process.classification.panel.trainingData.button')}
                        tooltip={msg('process.classification.panel.trainingData.tooltip')}>
                        <TrainingData recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
            </PanelWizard>
        )
    }
}

ClassificationToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default withRecipePath()(
    connect(mapStateToProps)(ClassificationToolbar)
)
