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
import {Clusterer} from './cluster/clusterer'
import {Retrieve} from './retrieve/retrieve'
import {Sampling} from './sampling/sampling'
import styles from './unsupervisedClassificationToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    collecting: selectFrom(recipe, 'ui.collect.collecting'),
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class _UnsupervisedClassificationToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['inputImagery']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery/>
                <Sampling/>
                <AuxiliaryImagery/>
                <Clusterer/>

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
                        label={msg('process.classification.panel.inputImagery.button')}
                        tooltip={msg('process.classification.panel.inputImagery.tooltip')}
                        disabled={!initialized}/>

                    <Toolbar.ActivationButton
                        id='sampling'
                        label={msg('process.unsupervisedClassification.panel.sampling.button')}
                        tooltip={msg('process.unsupervisedClassification.panel.sampling.tooltip')}/>

                    <Toolbar.ActivationButton
                        id='auxiliaryImagery'
                        label={msg('process.classification.panel.auxiliaryImagery.button')}
                        tooltip={msg('process.classification.panel.auxiliaryImagery.tooltip')}/>

                    <Toolbar.ActivationButton
                        id='clusterer'
                        label={msg('process.unsupervisedClassification.panel.clusterer.button')}
                        tooltip={msg('process.unsupervisedClassification.panel.clusterer.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const UnsupervisedClassificationToolbar = compose(
    _UnsupervisedClassificationToolbar,
    withRecipe(mapRecipeToProps)
)
