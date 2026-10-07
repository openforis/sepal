import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {SourceTypeButtons} from '~/app/home/body/process/sourceTypeButtons'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import {AssetSection} from './assetSection'
import {RecipeSection} from './recipeSection'
import styles from './reference.module.css'

const fields = {
    section: new Form.Field()
        .notBlank(),
    asset: new Form.Field()
        .skip((_value, {section}) => section !== 'ASSET')
        .notBlank('process.baytsAlerts.panel.reference.form.asset.required'),
    recipe: new Form.Field()
        .skip((_value, {section}) => section !== 'RECIPE_REF')
        .notBlank('process.baytsAlerts.panel.reference.form.recipe.required')
}

class _Reference extends React.Component {
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
                    title={msg('process.baytsAlerts.panel.reference.title')}/>
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

    // A source of the other type starts over: nothing selected for the previous one carries across.
    clearSource() {
        const {inputs} = this.props
        inputs.asset.set(undefined)
        inputs.recipe.set(undefined)
    }
}

// Only the selection. What the statistics hold, and the options they were built with, are read from the source while
// the recipe is shown (referenceObservation.js); a description an older GUI saved beside the selection - its bands,
// dates and visualizations - is read by nothing, and is dropped once the reference is applied again. Nothing selected
// yet is a recipe to select.
const modelToValues = ({id, type}) => {
    const values = {section: type || 'RECIPE_REF'}
    switch (type) {
        case 'RECIPE_REF':
            return {...values, recipe: id}
        case 'ASSET':
            return {...values, asset: id}
        default:
            return values
    }
}

const valuesToModel = ({section, asset, recipe}) => {
    switch (section) {
        case 'RECIPE_REF':
            return {type: section, id: recipe}
        case 'ASSET':
            return {type: section, id: asset}
        default:
            return null
    }
}

export const Reference = compose(
    _Reference,
    recipeFormPanel({id: 'reference', fields, valuesToModel, modelToValues})
)

Reference.propTypes = {}
