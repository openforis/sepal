import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {PanelSections} from '~/widget/panelSections'

import {AssetSection} from './assetSection'
import styles from './forestMask.module.css'
import {HansenSection} from './hansenSection'
import {RecipeSection} from './recipeSection'
import {SectionSelection} from './sectionSelection'

const fields = {
    section: new Form.Field()
        .notBlank(),
    asset: new Form.Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank('process.dias.panel.forestMask.form.asset.required'),
    recipe: new Form.Field()
        .skip((value, {section}) => section !== 'RECIPE_REF')
        .notBlank('process.dias.panel.forestMask.form.recipe.required'),
    threshold: new Form.Field()
        .skip((value, {section}) => section !== 'HANSEN')
        .notBlank('process.dias.panel.forestMask.form.threshold.required')
        .number()
        .min(0)
        .max(100)
}

class _ForestMask extends React.Component {
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
                label: msg('process.dias.panel.forestMask.recipe.label'),
                title: msg('process.dias.panel.forestMask.recipe.title'),
                component: <RecipeSection inputs={inputs}/>
            },
            {
                value: 'ASSET',
                label: msg('process.dias.panel.forestMask.asset.label'),
                title: msg('process.dias.panel.forestMask.asset.title'),
                component: <AssetSection inputs={inputs}/>
            },
            {
                value: 'HANSEN',
                label: msg('process.dias.panel.forestMask.hansen.label'),
                title: msg('process.dias.panel.forestMask.hansen.title'),
                component: <HansenSection inputs={inputs}/>
            }
        ]
        return (
            <PanelSections
                inputs={inputs}
                sections={sections}
                selected={inputs.section}
                icon='tree'
                label={msg('process.dias.panel.forestMask.title')}
            />
        )
    }
}

// Number.isFinite, not ?? - a bad-but-non-nullish value (NaN, from an
// earlier save made before this guard existed) must still be caught, or
// it self-perpetuates: NaN ?? 30 is NaN, not 30.
const DEFAULT_THRESHOLD = 30
const toValidThreshold = value => {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : DEFAULT_THRESHOLD
}

const modelToValues = ({id, type, threshold}) => {
    const values = {section: type || 'SELECTION'}
    switch (type) {
        case 'RECIPE_REF':
            return {...values, recipe: id}
        case 'ASSET':
            return {...values, asset: id}
        case 'HANSEN':
            return {...values, threshold: toValidThreshold(threshold)}
        default:
            return values
    }
}

const valuesToModel = ({type, section, asset, recipe, threshold}) => {
    switch (section) {
        case 'RECIPE_REF':
            return {type: section, id: recipe}
        case 'ASSET':
            return {type: section, id: asset}
        case 'HANSEN':
            return {type: section, threshold: toValidThreshold(threshold)}
        default:
            return {type}
    }
}

export const ForestMask = compose(
    _ForestMask,
    recipeFormPanel({id: 'forestMask', fields, valuesToModel, modelToValues})
)

ForestMask.propTypes = {}
