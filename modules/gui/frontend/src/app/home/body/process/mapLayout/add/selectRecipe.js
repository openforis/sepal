import {FormCombo} from 'widget/form/combo'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {connect, select} from 'store'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import React from 'react'
import styles from './selectRecipe.module.css'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class SelectRecipe extends React.Component {
    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel type='modal' className={styles.panel}>
                <Panel.Header title='Add Sepal recipe'/>
                <Panel.Content>
                    {this.renderRecipeSelector()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close onClick={deactivate}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderRecipeSelector() {
        const {recipes} = this.props
        const options = recipes.map(recipe => ({
            value: recipe.id,
            label: recipe.name
        }))
        return (
            <form>
                <FormCombo
                    label={msg('process.classification.panel.inputImagery.form.recipe.label')}
                    input={{set: () => null, validate: () => true}}
                    placeholder={msg('process.classification.panel.inputImagery.form.recipe.placeholder')}
                    options={options}
                    autoFocus={!isMobile()}
                    onChange={({value}) => this.selectRecipe(value)}
                    errorMessage
                />
            </form>
        )
    }

    selectRecipe(recipeId) {
        const {activator: {activatables: {fooRecipe}}} = this.props
        fooRecipe.activate({recipeId: recipeId})
    }
}

const policy = () => ({
    _: 'allow-then-deactivate'
})

export default compose(
    SelectRecipe,
    activatable({id: 'selectRecipe', policy, alwaysAllow: true}),
    activator('fooRecipe'),
    connect(mapStateToProps)
)
