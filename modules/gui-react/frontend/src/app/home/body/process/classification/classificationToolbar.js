import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {PanelWizard} from 'widget/panel'
import {PanelButton, Toolbar} from 'widget/toolbar'
import {recipePath, RecipeState} from './classificationRecipe'
import styles from './classificationToolbar.module.css'
import Retrieve from './retrieve/retrieve'
import Source from './source/source'
import TrainingData from './trainingData/trainingData'


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
                        tooltip='process.classification.panel.retrieve'
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
                        label='process.classification.panel.source.button'
                        tooltip='process.classification.panel.source'>
                        <Source recipeId={recipeId}/>
                    </PanelButton>

                    <PanelButton
                        name='trainingData'
                        label='process.classification.panel.trainingData.button'
                        tooltip='process.classification.panel.trainingData'>
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