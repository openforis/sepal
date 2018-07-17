import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import {Field, form} from 'widget/form'
import {Panel} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PanelSections from 'widget/panelSections'
import {RecipeActions, recipePath, RecipeState} from '../classificationRecipe'
import AssetSection from './assetSection'
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
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        values: recipeState('ui.source'),
    }
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
                component: <SectionSelection recipeId={recipeId} inputs={inputs}/>
            },
            {
                value: 'recipe',
                title: msg('process.classification.panel.source.recipe.title'),
                component: <RecipeSection recipeId={recipeId} inputs={inputs}/>
            },
            {
                value: 'asset',
                title: msg('process.classification.panel.source.asset.title'),
                component: <AssetSection recipeId={recipeId} inputs={inputs}/>
            }
        ]
        return (
            <Panel className={styles.panel}>
                <PanelSections sections={sections} selected={inputs.section} inputs={inputs}/>

                <PanelButtons
                    form={form}
                    statePath={recipePath(recipeId, 'ui')}
                    onApply={source => this.recipeActions.setSource(source).dispatch()}/>
            </Panel>
        )
    }
}

Source.propTypes = {
    recipeId: PropTypes.string,
}

export default form({fields, mapStateToProps})(Source)
