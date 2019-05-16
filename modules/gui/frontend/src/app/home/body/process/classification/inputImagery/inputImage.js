import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import React from 'react'
import {selectFrom} from 'stateUtils'
import {msg} from 'translate'
import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import PanelSections from 'widget/panelSections'
import AssetSection from './assetSection'
import styles from './inputImage.module.css'
import RecipeSection from './recipeSection'
import SectionSelection from './sectionSelection'

const fields = {
    id: new Field(),
    section: new Field()
        .notBlank('process.classification.panel.inputImagery.form.section.required'),
    recipe: new Field()
        .skip((value, {section}) => section !== 'RECIPE_REF')
        .notBlank('process.classification.panel.inputImagery.form.recipe.required'),
    asset: new Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank('process.classification.panel.inputImagery.form.asset.required'),
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id
})

class InputImage extends React.Component {
    render() {
        const {inputs} = this.props

        const sections = [
            {
                icon: 'image',
                title: msg('process.classification.panel.inputImagery.sections.title'),
                component: <SectionSelection section={inputs.section}/>
            },
            {
                value: 'RECIPE_REF',
                title: msg('process.classification.panel.inputImagery.recipe.title'),
                component: <RecipeSection recipe={inputs.recipe}/>
            },
            {
                value: 'ASSET',
                title: msg('process.classification.panel.inputImagery.asset.title'),
                component: <AssetSection asset={inputs.asset}/>
            }
        ]

        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'>
                <PanelSections sections={sections} selected={inputs.section} inputs={inputs}/>
                <FormPanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidUpdate() {
        const {inputs: {id}, activatable: {imageId}} = this.props
        id.set(imageId)
    }

    addImage() {
        const {onAdd, activatable: {deactivate}} = this.props
        onAdd(this.getSelectedImage())
        deactivate()
    }

    getSelectedImage() {
        const {inputs: {section, recipe, asset}} = this.props
        switch (section.value) {
            case 'ASSET':
                return {
                    type: 'ASSET',
                    id: asset.value
                }
            case 'RECIPE_REF':
                return {
                    type: 'RECIPE_REF',
                    id: recipe.value
                }
            default:
                throw new Error('Unexpected image section: ' + section.value)
        }

    }
}

const modelToValues = model => {
    const values = {imageId: model.imageId, section: model.type || 'SELECTION'}
    switch (model.type) {
        case  'RECIPE_REF':
            return {...values, recipe: model.id}
        case 'ASSET':
            return {...values, asset: model.id}
        default:
            return values
    }
}

const valuesToModel = values => {
    const model = {imageId: values.imageId, type: values.section}
    switch (values.section) {
        case  'RECIPE_REF':
            return {...model, id: values.recipe}
        case 'ASSET':
            return {...model, id: values.asset}
        default:
            return null
    }
}

const policy = () => ({_: 'allow'})
const panelOptions = {
    id: 'inputImage',
    path: props => {
        const imageId = selectFrom(props, 'activatable.imageId')
        return imageId ? ['inputImagery.images', {imageId}] : null
    },
    fields,
    valuesToModel,
    modelToValues,
    mapRecipeToProps,
    policy
}

export default recipeFormPanel(panelOptions)(
    InputImage
)

InputImage.propTypes = {}
