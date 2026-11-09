import PropTypes from 'prop-types'
import React from 'react'

import {InputImagery} from '~/app/home/body/process/panels/inputImageryWithDerived/inputImagery'
import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {SectionButton, withSectionMarks} from '../../requirements/sectionButton'
import {RetrieveButton} from '../../retrieve/retrieveButton'
import {RecipeActions} from '../classificationRecipe'
import {Legend} from '../legend/legend'
import {TRAINING_DATA} from '../trainingDataRequirements'
import {AuxiliaryImagery} from './auxiliaryImagery/auxiliaryImagery'
import styles from './classificationToolbar.module.css'
import {Classifier} from './classifier/classifier'
import {Retrieve} from './retrieve/retrieve'
import {TrainingData} from './trainingData/trainingData'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    collecting: selectFrom(recipe, 'ui.collect.collecting'),
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class _ClassificationToolbar extends React.Component {
    render() {
        const {recipeId, collecting, dataCollectionManager, initialized} = this.props
        return (
            <PanelWizard
                panels={['inputImagery', 'legend']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery/>
                <Legend dataCollectionManager={dataCollectionManager}/>
                <TrainingData dataCollectionManager={dataCollectionManager}/>
                <AuxiliaryImagery/>
                <Classifier/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <CollectButton collecting={collecting}/>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <SectionButton
                        id='inputImagery'
                        label={msg('process.classification.panel.inputImagery.button')}
                        tooltip={msg('process.classification.panel.inputImagery.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='legend'
                        label={msg('process.classification.panel.legend.button')}
                        tooltip={msg('process.classification.panel.legend.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <SectionButton
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

// Collecting reference data on the map, marked as Training data is while it is unfinished - with nothing to train on,
// collecting points is what to do next - unless it is being collected already.
const _CollectButton = ({recipeId, collecting, sectionMark}) => {
    const {problem, incomplete} = sectionMark(TRAINING_DATA.id)
    const next = incomplete && !collecting
    return (
        <Toolbar.Button
            selected={collecting}
            onClick={() => RecipeActions(recipeId).setCollecting(!collecting)}
            icon={'map-marker'}
            warning={next}
            tooltip={next ? problem : msg(collecting
                ? 'process.classification.collect.disable.tooltip'
                : 'process.classification.collect.enable.tooltip')}
            panel/>
    )
}

const CollectButton = compose(
    _CollectButton,
    withSectionMarks()
)

export const ClassificationToolbar = compose(
    _ClassificationToolbar,
    withRecipe(mapRecipeToProps)
)

ClassificationToolbar.propTypes = {
    dataCollectionManager: PropTypes.object.isRequired
}
