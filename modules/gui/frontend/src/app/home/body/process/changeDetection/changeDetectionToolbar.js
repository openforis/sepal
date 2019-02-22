import {Source1, Source2} from './source/source'
import {msg} from 'translate'
import {selectFrom} from 'collections'
import {setInitialized} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PanelWizard from 'widget/panelWizard'
import PropTypes from 'prop-types'
import React from 'react'
import Retrieve from './retrieve/retrieve'
import Toolbar, {ActivationButton} from 'widget/toolbar'
import TrainingData from './trainingData/trainingData'
import styles from './changeDetectionToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class ChangeDetectionToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['source1', 'source2', 'trainingData']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>
                <Source1/>
                <Source2/>
                <TrainingData recipeId={recipeId}/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <ActivationButton
                        id='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.changeDetection.panel.retrieve.tooltip')}
                        disabled={!initialized}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <ActivationButton
                        id='source1'
                        label={msg('process.changeDetection.panel.source1.button')}
                        tooltip={msg('process.changeDetection.panel.source1.tooltip')}/>
                    <ActivationButton
                        id='source2'
                        label={msg('process.changeDetection.panel.source2.button')}
                        tooltip={msg('process.changeDetection.panel.source2.tooltip')}/>

                    <ActivationButton
                        id='trainingData'
                        label={msg('process.changeDetection.panel.trainingData.button')}
                        tooltip={msg('process.changeDetection.panel.trainingData.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

ChangeDetectionToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default withRecipe(mapRecipeToProps)(ChangeDetectionToolbar)
