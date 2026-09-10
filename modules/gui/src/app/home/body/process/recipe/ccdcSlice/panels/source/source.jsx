import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {PanelSections} from '~/widget/panelSections'

import {AssetSection} from './assetSection'
import {RecipeSection} from './recipeSection'
import {SectionSelection} from './sectionSelection'
import styles from './source.module.css'

const fields = {
    section: new Form.Field()
        .notBlank(),
    asset: new Form.Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank('process.ccdcSlice.panel.source.form.asset.required'),
    recipe: new Form.Field()
        .skip((value, {section}) => section !== 'RECIPE_REF')
        .notBlank('process.ccdcSlice.panel.source.form.recipe.required'),
    dateFormat: new Form.Field()
        .skip((value, {section}) => section !== 'ASSET')
        .notBlank()
}

class _Source extends React.Component {
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
                label: msg('process.ccdcSlice.panel.source.recipe.label'),
                title: msg('process.ccdcSlice.panel.source.recipe.title'),
                component: <RecipeSection inputs={inputs}/>
            },
            {
                value: 'ASSET',
                label: msg('process.ccdcSlice.panel.source.asset.label'),
                title: msg('process.ccdcSlice.panel.source.asset.title'),
                component: <AssetSection inputs={inputs}/>
            }
        ]
        return (
            <PanelSections
                inputs={inputs}
                sections={sections}
                selected={inputs.section}
                icon='cog'
                label={msg('process.ccdcSlice.panel.source.title')}
            />
        )
    }
}
// Only the selection and, for an asset, the date representation the user configured. The description of
// the source - its bands, base bands, dates, templates - is evidence read from the source while the recipe
// is open, never written here; a copy an older GUI saved beside the reference is left as it is until the
// selection is applied again, and dropped then, because it described a source that may no longer be this.
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

const valuesToModel = ({section, asset, recipe, dateFormat}) => {
    const model = {
        type: section,
        dateFormat: section === 'ASSET' ? dateFormat : null
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

export const Source = compose(
    _Source,
    recipeFormPanel({id: 'source', fields, valuesToModel, modelToValues})
)

Source.propTypes = {}
