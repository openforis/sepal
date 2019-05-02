import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../classificationRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {activator} from 'widget/activation/activator'
import {connect} from 'store'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import AddImagery from './addImagery'
import React from 'react'
import SafetyButton from 'widget/safetyButton'
import _ from 'lodash'
import lookStyles from 'style/look.module.css'
import styles from './imagery.module.css'

const fields = {
    images: new Field()
        .notEmpty('process.classification.panel.imagery.notEmpty')
}

const mapStateToProps = (state, ownProps) => {
    const {inputs: {images}} = ownProps
    const recipeNameById = {};
    (images.value || [])
        .filter(image => image.type === 'RECIPE_REF')
        .map(image => selectFrom(state, ['process.recipes', {id: image.id}]))
        .forEach(recipe => recipeNameById[recipe.id] = recipe.name)
    return {recipeNameById}
}

class Imagery extends React.Component {
    openAdd() {
        const {activator: {activatables: {addImagery}}} = this.props
        addImagery.activate()
    }

    render() {
        const {recipeId} = this.props
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'
                    onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>

                    <PanelHeader
                        icon='image'
                        title={msg('process.classification.panel.imagery.title')}/>

                    <PanelContent>
                        <div>
                            {this.renderList()}
                        </div>
                    </PanelContent>

                    <FormPanelButtons>
                        <PanelButtons.Add onClick={() => this.openAdd()}/>
                    </FormPanelButtons>
                </RecipeFormPanel>

                <AddImagery onAdd={image => this.addImage(image)}/>
            </React.Fragment>
        )
    }

    renderList() {
        const {inputs: {images}} = this.props
        return (
            <ScrollableContainer className={styles.list}>
                <Scrollable>
                    <ul>

                        {(images.value || []).map(image => this.renderImage(image))}
                    </ul>
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderImage(image) {
        const {recipeNameById} = this.props
        const name = image.type === 'RECIPE_REF'
            ? recipeNameById[image.id]
            : image.id
        return (
            <li
                key={`${image.type}-${image.id}`}
                className={[styles.image, lookStyles.look, lookStyles.transparent, lookStyles.nonInteractive].join(' ')}>
                <div className={styles.imageInfo}>
                    <div className='itemType'>{msg(`process.classification.panel.imagery.type.${image.type}`)}</div>
                    <div>{name}</div>
                </div>

                <div className={styles.imageButtons}>
                    <SafetyButton
                        size='large'
                        message={msg('process.classification.panel.imagery.remove.confirmationMessage', {name})}
                        tooltip={msg('process.classification.panel.imagery.remove.tooltip')}
                        tooltipPlacement='bottom'
                        onConfirm={() => this.removeImage(image)}/>
                </div>
            </li>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }

    addImage(image) {
        const {inputs: {images}} = this.props
        const updatedImages = [...images.value]
        updatedImages.push(image)
        images.set(updatedImages)
    }

    removeImage(imageToRemove) {
        const {inputs: {images}} = this.props
        images.set((images.value || []).filter(image => !_.isEqual(image, imageToRemove)))
    }
}

Imagery.propTypes = {}
const additionalPolicy = () => ({addImagery: 'allow'})

export default activator('addImagery')(
    recipeFormPanel({id: 'imagery', fields, additionalPolicy})(
        connect(mapStateToProps)(
            Imagery
        )
    )
)
