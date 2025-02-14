import React from 'react'

import {InputImagery} from '~/app/home/body/process/panels/inputImageryWithDerived/inputImagery'
import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {AuxiliaryImagery} from '../../classification/panels/auxiliaryImagery/auxiliaryImagery'
import {RetrieveButton} from '../../retrieveButton'
import {Classifier} from './classifier/classifier'
import styles from './regressionToolbar.module.css'
import {Retrieve} from './retrieve/retrieve'
import {TrainingData} from './trainingData/trainingData'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    collecting: selectFrom(recipe, 'ui.collect.collecting'),
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class _RegressionToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['inputImagery', 'trainingData']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery/>
                <TrainingData/>
                <AuxiliaryImagery/>
                <Classifier/>

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
                        label={msg('process.classification.panel.inputImagery.button')}
                        tooltip={msg('process.classification.panel.inputImagery.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='trainingData'
                        label={msg('process.classification.panel.trainingData.button')}
                        tooltip={msg('process.classification.panel.trainingData.tooltip')}
                        panel/>
                    <Toolbar.ActivationButton
                        id='auxiliaryImagery'
                        label={msg('process.classification.panel.auxiliaryImagery.button')}
                        tooltip={msg('process.classification.panel.auxiliaryImagery.tooltip')}
                        panel/>
                    <Toolbar.ActivationButton
                        id='classifier'
                        label={msg('process.classification.panel.classifier.button')}
                        tooltip={msg('process.classification.panel.classifier.tooltip')}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const RegressionToolbar = compose(
    _RegressionToolbar,
    withRecipe(mapRecipeToProps)
)
