import React from 'react'

import {inputImageNames} from '~/app/home/body/process/inputImages'
import {lacksInputImagery} from '~/app/home/body/process/panels/inputImagery/inputImageryRequirements'
import {recipePath} from '~/app/home/body/process/recipe'
import {withItemProblems} from '~/app/home/body/process/recipe/selectedSource'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivators} from '~/widget/activation/activator'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'

import {RecipeActions} from '../../recipe/classification/classificationRecipe'
import {InputImage} from './inputImage'
import styles from './inputImagery.module.css'
import {INPUT_IMAGERY} from './inputImageryRequirements'

// The list holds the images applied: each is applied as its own editor applies it. It is complete once it lists one.
// Its submission is judged by the list applied then, not as last rendered: the last image can go just before it.
const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images') || [],
    missing: lacksInputImagery(recipe.model)
})

const mapStateToProps = (state, {images}) => ({
    names: inputImageNames(state, images)
})

class _InputImagery extends React.Component {
    render() {
        const {missing, recipeId} = this.props
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'
                    accepts={() => !lacksInputImagery(select(recipePath(recipeId, 'model')))}>
                    <Panel.Header
                        icon='image'
                        title={msg('process.classification.panel.inputImagery.title')}/>
                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>
                    <Form.PanelButtons invalid={missing}>
                        <Panel.Buttons.Add onClick={() => this.addImage()}/>
                    </Form.PanelButtons>
                </RecipeFormPanel>
                <InputImage/>
            </React.Fragment>
        )
    }

    renderContent() {
        const {images, missing} = this.props
        return missing
            ? this.renderNoImageryMessage()
            : this.renderImages(images)
    }

    renderImages(images) {
        return (
            <Layout type='vertical' spacing='tight'>
                {images.map(image => this.renderImage(image))}
            </Layout>
        )
    }

    // An input whose band sets select what its source does not provide is marked, saying why (inputImageryRequirements.js).
    renderImage(image) {
        const {names, itemProblems} = this.props
        return (
            <ListItem
                key={image.imageId}
                onClick={() => this.editImage(image)}>
                <CrudItem
                    title={msg(`process.classification.panel.inputImagery.type.${image.type}`)}
                    description={names[image.imageId]}
                    error={itemProblems[image.imageId]}
                    removeTooltip={msg('process.classification.panel.inputImagery.remove.tooltip')}
                    onRemove={() => this.removeImage(image)}
                />
            </ListItem>
        )
    }

    renderNoImageryMessage() {
        return (
            <NoData message={msg('process.classification.panel.inputImagery.noImagery')}/>
        )
    }

    addImage() {
        const {activator: {activatables: {inputImage}}} = this.props
        inputImage.activate({imageId: uuid()})
    }

    editImage(image) {
        const {activator: {activatables: {inputImage}}} = this.props
        inputImage.activate({imageId: image.imageId})
    }

    removeImage(imageToRemove) {
        const {recipeId} = this.props

        RecipeActions(recipeId).removeInputImage(imageToRemove)
    }
}
// The editor of one of its images opens beside it; anything else is as for any section.
export const additionalPolicy = () => ({inputImage: 'allow'})
// [HACK] This actually isn't a form, and we don't want to update the model. This prevents the selected images from
// being overridden.
const valuesToModel = null

export const InputImagery = compose(
    _InputImagery,
    connect(mapStateToProps),
    withItemProblems(INPUT_IMAGERY.id),
    recipeFormPanel({id: 'inputImagery', mapRecipeToProps, valuesToModel, additionalPolicy}),
    withActivators('inputImage')
)

InputImagery.propTypes = {}
