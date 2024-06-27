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
        .skip((_value, {section}) => section !== 'ASSET')
        .notBlank('process.baytsAlerts.panel.reference.form.asset.required'),
    recipe: new Form.Field()
        .skip((_value, {section}) => section !== 'RECIPE_REF')
        .notBlank('process.baytsAlerts.panel.reference.form.recipe.required'),
    bands: new Form.Field()
        .skip((_value, {section}) => section !== 'ASSET')
        .notEmpty(),
    startDate: new Form.Field(),
    endDate: new Form.Field(),
    visualizations: new Form.Field(),
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
                label: msg('process.baytsAlerts.panel.reference.recipe.label'),
                title: msg('process.baytsAlerts.panel.reference.recipe.title'),
                component: <RecipeSection inputs={inputs}/>
            },
            {
                value: 'ASSET',
                label: msg('process.baytsAlerts.panel.reference.asset.label'),
                title: msg('process.baytsAlerts.panel.reference.asset.title'),
                component: <AssetSection inputs={inputs}/>
            }
        ]
        return (
            <PanelSections
                inputs={inputs}
                sections={sections}
                selected={inputs.section}
                icon='cog'
                label={msg('process.baytsAlerts.panel.reference.title')}
            />
        )
    }
}
const modelToValues = ({id, type, bands, startDate, endDate, visualizations}) => {
    const values = {
        section: type || 'SELECTION',
        bands,
        startDate,
        endDate,
        visualizations
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

const valuesToModel = ({section, asset, recipe, bands, startDate, endDate, visualizations}) => {
    const model = {
        type: section,
        bands,
        startDate,
        endDate,
        visualizations
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
