import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {SourceTypeButtons} from '~/app/home/body/process/sourceTypeButtons'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import {AssetSection} from './assetSection'
import {RecipeSection} from './recipeSection'
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
    constructor(props) {
        super(props)
        this.clearSource = this.clearSource.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.ccdcSlice.panel.source.title')}/>
                <Panel.Content>
                    {this.renderSource()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderSource() {
        const {inputs} = this.props
        const labelButtons = [
            <SourceTypeButtons key='section' input={inputs.section} recipe='RECIPE_REF' onChange={this.clearSource}/>
        ]
        return inputs.section.value === 'ASSET'
            ? <AssetSection inputs={inputs} labelButtons={labelButtons}/>
            : <RecipeSection inputs={inputs} labelButtons={labelButtons}/>
    }

    // A source of the other type starts over: nothing selected or configured for the previous one carries across.
    clearSource() {
        const {inputs} = this.props
        inputs.asset.set(undefined)
        inputs.recipe.set(undefined)
        inputs.dateFormat.set(undefined)
    }
}

// Only the selection and, for an asset, the date representation the user configured. The description of
// the source - its bands, base bands, dates, templates - is evidence read from the source while the recipe
// is open, never written here; a copy an older GUI saved beside the reference is left as it is until the
// selection is applied again, and dropped then, because it described a source that may no longer be this.
// Nothing selected yet is a recipe to select.
const modelToValues = ({id, type, dateFormat}) => {
    const values = {
        section: type || 'RECIPE_REF',
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
