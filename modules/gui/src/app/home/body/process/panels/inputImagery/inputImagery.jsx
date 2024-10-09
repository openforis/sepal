import PropTypes from 'prop-types'
import React from 'react'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
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

class _InputImagery extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
    }

    render() {
        const {images} = this.props
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'>
                    <Panel.Header
                        icon='image'
                        title={msg('process.panels.inputImagery.title')}/>
                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>
                    <Form.PanelButtons invalid={!images.length}>
                        <Panel.Buttons.Add onClick={() => this.addImage()}/>
                    </Form.PanelButtons>
                </RecipeFormPanel>
                <InputImage onChange={this.onChange}/>
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
        return (
            <Layout type='vertical' spacing='tight'>
                {images.map((image, index) => this.renderImage(image, index))}
            </Layout>
        )
    }

    renderImage(image, index) {
        const {recipeNameById} = this.props
        const name = image.type === 'RECIPE_REF'
            ? recipeNameById[image.id]
            : image.id
        const key = `${image.type}-${image.id}-${index}`
        return name
            ? (
                <ListItem
                    key={key}
                    onClick={() => this.editImage(image)}>
                    <CrudItem
                        title={msg(`process.panels.inputImagery.form.type.${image.type}`)}
                        description={name}
                        onRemove={() => this.removeImage(image)}
                    />
                </ListItem>
            )
            : null
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
        const actionBuilder = recipeActionBuilder(recipeId)
        actionBuilder('REMOVE_INPUT_IMAGE', {imageToRemove})
            .del(['model.inputImagery.images', {id: imageToRemove.id}])
            .del(['ui.inputImagery.images', {id: imageToRemove.id}])
            .dispatch()
    }

    onChange() {
        const {images, onChange} = this.props
        onChange && onChange(images)
    }
}

const additionalPolicy = () => ({_: 'allow'})
// [HACK] This actually isn't a form, and we don't want to update the model. This prevents the selected images from
// being overridden.
const valuesToModel = null

export const InputImagery = compose(
    _InputImagery,
    connect(mapStateToProps),
    recipeFormPanel({id: 'inputImagery', mapRecipeToProps, valuesToModel, additionalPolicy}),
    withActivators('inputImage')
)

InputImagery.propTypes = {
    onChange: PropTypes.func
}
