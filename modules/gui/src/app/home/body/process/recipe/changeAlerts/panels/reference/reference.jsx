import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {PanelSections} from '~/widget/panelSections'

import {AssetSection} from './assetSection'
import {RecipeSection} from './recipeSection'
import styles from './reference.module.css'
import {SectionSelection} from './sectionSelection'

const fields = {
    section: new Form.Field()
        .notBlank(),
    asset: new Form.Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank('process.changeAlerts.panel.reference.form.asset.required'),
    recipe: new Form.Field()
        .skip((value, {section}) => section !== 'RECIPE_REF')
        .notBlank('process.changeAlerts.panel.reference.form.recipe.required'),
    dateFormat: new Form.Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank()
}

class _Reference extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                {this.renderSections()}
            </RecipeFormPanel>
        )
    }

    renderSections() {
        const {recipeId, inputs} = this.props
        const sections = [
            {
                component: <SectionSelection recipeId={recipeId} inputs={inputs}/>
            },
            {
                value: 'RECIPE_REF',
                label: msg('process.changeAlerts.panel.reference.recipe.label'),
                title: msg('process.changeAlerts.panel.reference.recipe.title'),
                component: <RecipeSection inputs={inputs}/>
            },
            {
                value: 'ASSET',
                label: msg('process.changeAlerts.panel.reference.asset.label'),
                title: msg('process.changeAlerts.panel.reference.asset.title'),
                component: <AssetSection inputs={inputs}/>
            }
        ]
        return (
            <PanelSections
                inputs={inputs}
                sections={sections}
                selected={inputs.section}
                icon='cog'
                label={msg('process.changeAlerts.panel.reference.title')}
            />
        )
    }
}
const modelToValues = ({id, type, dateFormat}) => {
    const values = {
        section: type || 'SELECTION',
        dateFormat
    }
    switch (type) {
        case 'RECIPE_REF':
            return {...values, recipe: id}
        case 'ASSET':
            return {...values, asset: id}
        default:
            return values
    }
}

// The selection and the configuration made about it. The description of what it produces is the source's,
// read when it is needed, and is not written here.
const valuesToModel = ({type, section, asset, recipe, dateFormat}) => {
    const model = {
        type: section,
        dateFormat: type === 'RECIPE_REF' ? null : dateFormat
    }
    switch (section) {
        case 'RECIPE_REF':
            return {...model, id: recipe}
        case 'ASSET':
            return {...model, id: asset}
        default:
            return null
    }
}

export const Reference = compose(
    _Reference,
    recipeFormPanel({id: 'reference', fields, valuesToModel, modelToValues})
)

Reference.propTypes = {}
