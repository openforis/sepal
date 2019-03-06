import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {RecipeActions} from 'app/home/body/process/classification/classificationRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {msg} from 'translate'
import AssetSection from './assetSection'
import PanelSections from 'widget/panelSections'
import React from 'react'
import RecipeSection from './recipeSection'
import SectionSelection from './sectionSelection'
import styles from './source.module.css'

const fields = {
    section: new Field()
        .notBlank('process.changeDetection.panel.source.form.section.required'),
    recipe: new Field()
        .skip((value, {section}) => section !== 'recipe')
        .notBlank('process.changeDetection.panel.source.form.recipe.required'),
    asset: new Field()
        .skip((value, {section}) => section !== 'asset')
        .notBlank('process.changeDetection.panel.source.form.asset.required'),
}

class Source extends React.Component {
    render() {
        const {recipeId, number, inputs} = this.props
        const sections = [
            {
                icon: 'cog',
                title: msg(`process.changeDetection.panel.source${number}.title`),
                component: <SectionSelection section={inputs.section}/>
            },
            {
                value: 'RECIPE_REF',
                title: msg('process.changeDetection.panel.source.recipe.title'),
                component: <RecipeSection recipe={inputs.recipe}/>
            },
            {
                value: 'ASSET',
                title: msg('process.changeDetection.panel.source.asset.title'),
                component: <AssetSection asset={inputs.asset}/>
            }
        ]
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>
                <PanelSections sections={sections} selected={inputs.section} inputs={inputs}/>

                <FormPanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }
}

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

export const Source1 = recipeFormPanel({id: 'source1', fields, modelToValues, valuesToModel})(
    props => <Source number={1} {...props}/>
)

Source1.propTypes = {}

export const Source2 = recipeFormPanel({id: 'source2', fields, modelToValues, valuesToModel})(
    props => <Source number={2} {...props}/>
)

Source2.propTypes = {}
