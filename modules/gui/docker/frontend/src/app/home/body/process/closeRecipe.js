import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {closeRecipe} from './recipe'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './closeRecipe.module.css'

class CloseRecipe extends React.Component {
    render() {
        const {activator: {activatables: {saveRecipeDialog}}, activatable} = this.props
        const recipe = activatable.recipe
        const title = recipe.title || recipe.placeholder
        const cancel = () => activatable.deactivate()
        const save = () => {
            activatable.deactivate()
            saveRecipeDialog.activate({recipe, closeTabOnSave: true})
        }
        const discard = () => {
            activatable.deactivate()
            closeRecipe(activatable.recipe.id)
        }
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='exclamation-triangle'
                    title={title}/>
                <Panel.Content>
                    <div className={styles.message}>
                        {msg('process.closeRecipe.message')}
                    </div>
                </Panel.Content>
                <Panel.Buttons onEnter={save} onEscape={cancel}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel onClick={cancel}/>
                        <Panel.Buttons.Save dots onClick={save}/>
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Discard onClick={discard}/>
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }
}

CloseRecipe.propTypes = {}

const policy = () => ({
    _: 'allow'
})

export default compose(
    CloseRecipe,
    activator('saveRecipeDialog'),
    activatable({id: 'closeRecipeDialog', policy})
)
