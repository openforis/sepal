import PropTypes from 'prop-types'
import React from 'react'

import {inputImageNames, removeInputImage} from '~/app/home/body/process/inputImages'
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

import {InputImage} from './inputImage'
import styles from './inputImagery.module.css'
import {INPUT_IMAGERY, lacksInputImagery} from './inputImageryRequirements'

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
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
    }

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
                        title={msg('process.panels.inputImagery.title')}/>
                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>
                    <Form.PanelButtons invalid={missing}>
                        <Panel.Buttons.Add onClick={() => this.addImage()}/>
                    </Form.PanelButtons>
                </RecipeFormPanel>
                <InputImage onChange={this.onChange}/>
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
            <Layout type='vertical' spacing='tight' shrink>
                {images.map(image => this.renderImage(image))}
            </Layout>
        )
    }

    // Every input configured is shown, to be edited or removed, whether or not its source is listed (inputImageNames).
    renderImage(image) {
        const {names, itemProblems} = this.props
        return (
            <ListItem
                key={image.imageId}
                onClick={() => this.editImage(image)}>
                <CrudItem
                    title={msg(`process.panels.inputImagery.form.type.${image.type}`)}
                    error={itemProblems[image.imageId]}
                    description={names[image.imageId]}
                    onRemove={() => this.removeImage(image)}
                />
            </ListItem>
        )
    }

    renderNoImageryMessage() {
        return (
            <NoData message={msg('process.panels.inputImagery.form.noImagery')}/>
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
        removeInputImage(recipeId, imageToRemove)
    }

    onChange() {
        const {images, onChange} = this.props
        onChange && onChange(images)
    }
}

const additionalPolicy = () => ({inputImage: 'allow'})
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

InputImagery.propTypes = {
    onChange: PropTypes.func
}
