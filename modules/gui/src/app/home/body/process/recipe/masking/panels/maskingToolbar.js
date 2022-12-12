import {Retrieve} from './retrieve/retrieve'
import {RetrieveButton} from '../../retrieveButton'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import ImageMask from './inputImage/imageMask'
import ImageToMask from './inputImage/imageToMask'
import PanelWizard from 'widget/panelWizard'
import React from 'react'
import styles from './maskingToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized')
})

class MaskingToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['imageToMask', 'imageMask']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>

                <ImageToMask/>
                <ImageMask/>

                <Toolbar
                    vertical
                    placement="top-right"
                    panel
                    className={styles.top}>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement="bottom-right"
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id="imageToMask"
                        label={msg('process.masking.panel.inputImage.imageToMask.button.label')}
                        tooltip={msg('process.masking.panel.inputImage.imageToMask.button.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id="imageMask"
                        label={msg('process.masking.panel.inputImage.imageMask.button.label')}
                        tooltip={msg('process.masking.panel.inputImage.imageMask.button.tooltip')}
                        disabled={!initialized}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export default compose(
    MaskingToolbar,
    withRecipe(mapRecipeToProps)
)
