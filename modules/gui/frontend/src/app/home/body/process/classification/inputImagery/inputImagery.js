import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import guid from 'guid'
import React from 'react'
import {selectFrom} from 'stateUtils'
import {connect} from 'store'
import lookStyles from 'style/look.module.css'
import {msg} from 'translate'
import {activator} from 'widget/activation/activator'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import SafetyButton from 'widget/safetyButton'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {RecipeActions} from '../classificationRecipe'
import InputImage from './inputImage'
import styles from './inputImagery.module.css'


const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images') || []
})

const mapStateToProps = (state, ownProps) => {
    const {images} = ownProps
    const recipeNameById = {}
    images
        .filter(image => image.type === 'RECIPE_REF')
        .map(image => selectFrom(state, ['process.recipes', {id: image.recipeId}]))
        .forEach(recipe => recipeNameById[recipe.id] = recipe.name)
    return {recipeNameById}
}

class InputImagery extends React.Component {
    render() {
        const {images} = this.props
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'>

                    <PanelHeader
                        icon='image'
                        title={msg('process.classification.panel.inputImagery.title')}/>

                    <PanelContent>
                        <div>
                            {this.renderList()}
                        </div>
                    </PanelContent>

                    <FormPanelButtons invalid={!images.length}>
                        <PanelButtons.Add onClick={() => this.addImage()}/>
                    </FormPanelButtons>
                </RecipeFormPanel>

                <InputImage/>
            </React.Fragment>
        )
    }

    renderList() {
        const {images} = this.props
        return (
            <ScrollableContainer className={styles.list}>
                <Scrollable>
                    <ul>
                        {(images || []).map(image => this.renderImage(image))}
                    </ul>
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderImage(image) {
        const {recipeNameById} = this.props
        const name = image.type === 'RECIPE_REF'
            ? recipeNameById[image.recipeId]
            : image.assetId
        return (
            <li
                key={`${image.type}-${image.id}`}
                className={[styles.image, lookStyles.look, lookStyles.transparent].join(' ')}
                onClick={() => this.editImage(image)}>
                <div className={styles.imageInfo}>
                    <div
                        className='itemType'>{msg(`process.classification.panel.inputImagery.type.${image.type}`)}</div>
                    <div>{name}</div>
                </div>

                <div className={styles.imageButtons}>
                    <SafetyButton
                        size='large'
                        message={msg('process.classification.panel.inputImagery.remove.confirmationMessage', {name})}
                        tooltip={msg('process.classification.panel.inputImagery.remove.tooltip')}
                        tooltipPlacement='bottom'
                        onConfirm={() => this.removeImage(image)}/>
                </div>
            </li>
        )
    }

    addImage() {
        const {activator: {activatables: {inputImage}}} = this.props
        inputImage.activate({imageId: guid()})
    }

    editImage(image) {
        const {activator: {activatables: {inputImage}}} = this.props
        inputImage.activate({imageId: image.id})
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }

    removeImage(imageToRemove) {
        const {recipeId} = this.props
        RecipeActions(recipeId).removeInputImage(imageToRemove)
    }
}

InputImagery.propTypes = {}
const additionalPolicy = () => ({_: 'allow'})
// [HACK] This actually isn't a form, and we don't want to update the model. This prevents the selected images from
// being overridden.
const valuesToModel = null

export default (
    activator('inputImage')(
        recipeFormPanel({id: 'inputImagery', mapRecipeToProps, valuesToModel, additionalPolicy})(
            connect(mapStateToProps)(
                InputImagery
            )
        )
    )
)
