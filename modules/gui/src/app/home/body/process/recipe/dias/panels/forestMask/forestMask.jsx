import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {PanelSections} from '~/widget/panelSections'

import {AssetSection} from './assetSection'
import styles from './forestMask.module.css'
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
        .notBlank('process.dias.panel.forestMask.form.recipe.required')
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

const modelToValues = ({id, type}) => {
    const values = {section: type || 'SELECTION'}
    switch (type) {
        case 'RECIPE_REF':
            return {...values, recipe: id}
        case 'ASSET':
            return {...values, asset: id}
        default:
            return values
    }
}

const valuesToModel = ({type, section, asset, recipe}) => {
    switch (section) {
        case 'RECIPE_REF':
            return {type: section, id: recipe}
        case 'ASSET':
            return {type: section, id: asset}
        default:
            return {type}
    }
}

export const ForestMask = compose(
    _ForestMask,
    recipeFormPanel({id: 'forestMask', fields, valuesToModel, modelToValues})
)

ForestMask.propTypes = {}
