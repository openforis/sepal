import {FormPanelButtons} from 'widget/formPanel'
import {PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../classificationRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import InputImage from './inputImage'
import React from 'react'
import SuperButton from 'widget/superButton'
import guid from 'guid'
import styles from './inputImagery.module.css'

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images') || []
})

const mapStateToProps = (state, ownProps) => {
    const {images} = ownProps
    const recipeNameById = {}
    images
        .filter(image => image.type === 'RECIPE_REF')
        .map(image => selectFrom(state, ['process.recipes', {id: image.id}]))
        .filter(recipe => recipe)
        .forEach(recipe => recipeNameById[recipe.id] = recipe.name)
    return {recipeNameById}
}

class InputImagery extends React.Component {
    render() {
        const {recipeId, images} = this.props
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'
                    onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>
                    <PanelHeader
                        icon='image'
                        title={msg('process.classification.panel.inputImagery.title')}/>
                    <PanelContent>
                        {this.renderContent()}
                    </PanelContent>
                    <FormPanelButtons invalid={!images.length}>
                        <PanelButtons.Add onClick={() => this.addImage()}/>
                    </FormPanelButtons>
                </RecipeFormPanel>
                <InputImage/>
            </React.Fragment>
        )
    }

    renderContent() {
        const {images = []} = this.props
        return images.length
            ? this.renderImages(images)
            : this.renderNoImageryMessage()
    }

    renderImages(images) {
        return images.map(image => this.renderImage(image))
    }

    renderImage(image) {
        const {recipeNameById} = this.props
        const name = image.type === 'RECIPE_REF'
            ? recipeNameById[image.id]
            : image.id
        if (!name)
            return null
        return (
            <SuperButton
                key={`${image.type}-${image.id}`}
                title={msg(`process.classification.panel.inputImagery.type.${image.type}`)}
                description={name}
                removeMessage={msg('process.classification.panel.inputImagery.remove.confirmationMessage', {name})}
                removeTooltip={msg('process.classification.panel.inputImagery.remove.tooltip')}
                onClick={() => this.editImage(image)}
                onRemove={() => this.removeImage(image)}
            />
        )
    }

    renderNoImageryMessage() {
        return (
            <div className={styles.noImagery}>
                {msg('process.classification.panel.inputImagery.noImagery')}
            </div>
        )
    }

    addImage() {
        const {activator: {activatables: {inputImage}}} = this.props
        inputImage.activate({imageId: guid()})
    }

    editImage(image) {
        const {activator: {activatables: {inputImage}}} = this.props
        inputImage.activate({imageId: image.imageId})
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

export default compose(
    InputImagery,
    connect(mapStateToProps),
    recipeFormPanel({id: 'inputImagery', mapRecipeToProps, valuesToModel, additionalPolicy}),
    activator('inputImage')
)
