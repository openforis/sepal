import {Field, form} from 'widget/form'
import {RecipeActions, RecipeState, recipePath} from '../classificationRecipe'
import {msg} from 'translate'
import AssetSection from './assetSection'
import Panel from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PanelSections from 'widget/panelSections'
import PropTypes from 'prop-types'
import React from 'react'
import RecipeSection from './recipeSection'
import SectionSelection from './sectionSelection'
import styles from './source.module.css'

const fields = {
    section: new Field()
        .notBlank('process.classification.panel.source.form.section.required'),
    recipe: new Field()
        .skip((value, {section}) => section !== 'recipe')
        .notBlank('process.classification.panel.source.form.recipe.required'),
    asset: new Field()
        .skip((value, {section}) => section !== 'asset')
        .notBlank('process.classification.panel.source.form.asset.required'),
}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    const model = recipeState('model.source')
    let values = recipeState('ui.source')
    if (!values) {
        values = modelToValues(model)
        RecipeActions(recipeId).setSource({values, model}).dispatch()
    }
    return {model, values}
}

class Source extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, form, inputs} = this.props
        const sections = [
            {
                icon: 'cog',
                title: msg('process.classification.panel.source.title'),
                component: <SectionSelection section={inputs.section}/>
            },
            {
                value: 'RECIPE_REF',
                title: msg('process.classification.panel.source.recipe.title'),
                component: <RecipeSection recipe={inputs.recipe}/>
            },
            {
                value: 'ASSET',
                title: msg('process.classification.panel.source.asset.title'),
                component: <AssetSection asset={inputs.asset}/>
            }
        ]
        return (
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath(recipeId, 'ui')}
                onApply={values => this.recipeActions.setSource({
                    values,
                    model: valuesToModel(values)
                }).dispatch()}>
                <PanelSections sections={sections} selected={inputs.section} inputs={inputs}/>

                <PanelButtons/>
            </Panel>
        )
    }
}

Source.propTypes = {
    recipeId: PropTypes.string
}

export default form({fields, mapStateToProps})(Source)

const valuesToModel = values => {
    switch (values.section) {
    case 'ASSET':
        return {
            type: 'ASSET',
            id: values.asset
        }
    case 'RECIPE_REF':
        return {
            type: 'RECIPE_REF',
            id: values.recipe
        }
    default:
        throw new Error('Unexpected source section: ' + values.section)
    }
}

const modelToValues = (model = {}) => {
    switch (model.type) {
    case 'ASSET':
        return {
            section: 'ASSET',
            asset: model.id
        }
    case 'RECIPE_REF':
        return {
            section: 'RECIPE_REF',
            recipe: model.id
        }
    case undefined:
        return {}
    default:
        throw new Error('Unexpected source type: ' + model.type)
    }
}
