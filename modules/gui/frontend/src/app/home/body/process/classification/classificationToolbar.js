import {RecipeState, recipePath} from './classificationRecipe'
import {connect} from 'store'
import {msg} from 'translate'
import PanelWizard from 'widget/panelWizard'
import PropTypes from 'prop-types'
import React from 'react'
import Retrieve from './retrieve/retrieve'
import Source from './source/source'
import Toolbar, {PanelButton} from 'widget/toolbar'
import TrainingData from './trainingData/trainingData'
import styles from './classificationToolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        initialized: recipeState('ui.initialized'),
    }
}

class ClassificationToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        const statePath = recipePath(recipeId, 'ui')
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

export default connect(mapStateToProps)(ClassificationToolbar)
