import {Field, form} from 'widget/form'
import {PanelButtons} from 'widget/panel'
import {activatable} from 'widget/activation/activatable'
import {msg} from 'translate'
import {withRecipe} from 'app/home/body/process/recipeContext'
import AssetSection from './assetSection'
import FormPanel from 'widget/formPanel'
import PanelSections from 'widget/panelSections'
import PropTypes from 'prop-types'
import React from 'react'
import RecipeSection from './recipeSection'
import SectionSelection from './sectionSelection'
import styles from './addImagery.module.css'

const fields = {
    section: new Field()
        .notBlank('process.classification.panel.imagery.form.section.required'),
    recipe: new Field()
        .skip((value, {section}) => section !== 'RECIPE_REF')
        .notBlank('process.classification.panel.imagery.form.recipe.required'),
    asset: new Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank('process.classification.panel.imagery.form.asset.required'),
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id
})

class _AddImagery extends React.Component {
    render() {
        const {form, inputs, activatable: {deactivate}} = this.props
        const close = () => deactivate()

        const sections = [
            {
                icon: 'image',
                title: msg('process.classification.panel.imagery.sections.title'),
                component: <SectionSelection section={inputs.section}/>
            },
            {
                value: 'RECIPE_REF',
                title: msg('process.classification.panel.imagery.recipe.title'),
                component: <RecipeSection recipe={inputs.recipe}/>
            },
            {
                value: 'ASSET',
                title: msg('process.classification.panel.imagery.asset.title'),
                component: <AssetSection asset={inputs.asset}/>
            }
        ]

        return (
            <FormPanel
                form={form}
                close={close}
                className={styles.panel}
                type='modal'>
                <PanelSections sections={sections} selected={inputs.section} inputs={inputs}/>
                <PanelButtons onEnter={close} onEscape={close}>
                    <PanelButtons.Main>
                        <PanelButtons.Cancel
                            onClick={close}/>
                        <PanelButtons.Add
                            disabled={form.isInvalid()}
                            onClick={() => this.addImage()}/>
                    </PanelButtons.Main>
                </PanelButtons>
            </FormPanel>
        )
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

const policy = () => ({_: 'allow'})

const AddImagery = (
    activatable({id: 'addImagery', policy})(
        withRecipe(mapRecipeToProps)(
            form({fields})(
                _AddImagery
            )
        )
    )
)

export default AddImagery

AddImagery.propTypes = {
    onAdd: PropTypes.func.isRequired
}
