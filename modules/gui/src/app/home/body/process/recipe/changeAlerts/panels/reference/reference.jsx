import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {SourceKind} from '~/app/home/body/process/sourceTypeButtons'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import {AssetSection} from './assetSection'
import {RecipeSection} from './recipeSection'
import styles from './reference.module.css'

// A reference not yet selected is a recipe to select.
const NEW_REFERENCE_KIND = 'RECIPE_REF'

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
                <Panel.Header
                    icon='cog'
                    title={msg('process.changeAlerts.panel.reference.title')}/>
                <Panel.Content>
                    {this.renderSource()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    // The kind of source is chosen beside its picker. Each picker keeps what was selected in it while the form is open;
    // only the kind shown is applied.
    renderSource() {
        const {inputs} = this.props
        return (
            <SourceKind input={inputs.section} recipe='RECIPE_REF' defaultKind={NEW_REFERENCE_KIND}>
                {({recipe, labelButtons}) => recipe
                    ? <RecipeSection inputs={inputs} labelButtons={labelButtons}/>
                    : <AssetSection inputs={inputs} labelButtons={labelButtons}/>}
            </SourceKind>
        )
    }
}

const modelToValues = ({id, type, dateFormat}) => {
    const values = {
        section: type,
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
const valuesToModel = ({section, asset, recipe, dateFormat}) => {
    switch (section) {
        case 'RECIPE_REF':
            return {type: section, id: recipe}
        case 'ASSET':
            return {type: section, id: asset, dateFormat}
        default:
            return null
    }
}

export const Reference = compose(
    _Reference,
    recipeFormPanel({id: 'reference', fields, valuesToModel, modelToValues})
)

Reference.propTypes = {}
