import {compose} from 'compose'
import React from 'react'
import {connect, select} from 'store'
import {msg} from 'translate'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import Combo from 'widget/combo'
import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {isMobile} from 'widget/userAgent'
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
                <PanelHeader title='Add Sepal recipe'/>
                <PanelContent>
                    {this.renderRecipeSelector()}
                </PanelContent>
                <PanelButtons>
                    <PanelButtons.Main>
                        <PanelButtons.Close onClick={deactivate}/>
                    </PanelButtons.Main>
                </PanelButtons>
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
                <Combo
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
