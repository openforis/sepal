import {setInitialized} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import PanelWizard from 'widget/panelWizard'
import Toolbar, {ActivationButton} from 'widget/toolbar'
import styles from './classificationToolbar.module.css'
import Retrieve from './retrieve/retrieve'
import Source from './source/source'
import TrainingData from './trainingData/trainingData'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class ClassificationToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['source', 'trainingData']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>
                <Source/>
                <TrainingData/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>

                    <ActivationButton
                        id='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.classification.panel.retrieve.tooltip')}
                        disabled={!initialized}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <ActivationButton
                        id='source'
                        label={msg('process.classification.panel.source.button')}
                        tooltip={msg('process.classification.panel.source.tooltip')}/>

                    <ActivationButton
                        id='trainingData'
                        label={msg('process.classification.panel.trainingData.button')}
                        tooltip={msg('process.classification.panel.trainingData.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

ClassificationToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default withRecipe(mapRecipeToProps)(ClassificationToolbar)
