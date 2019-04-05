import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {closeRecipe} from './recipe'
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
                <PanelHeader
                    icon='exclamation-triangle'
                    title={title}/>
                <PanelContent>
                    <div className={styles.message}>
                        {msg('process.closeRecipe.message')}
                    </div>
                </PanelContent>
                <PanelButtons onEnter={save} onEscape={cancel}>
                    <PanelButtons.Main>
                        <PanelButtons.Cancel onClick={cancel}/>
                        <PanelButtons.Save dots onClick={save}/>
                    </PanelButtons.Main>
                    <PanelButtons.Extra>
                        <PanelButtons.Discard onClick={discard}/>
                    </PanelButtons.Extra>
                </PanelButtons>
            </Panel>
        )
    }
}

CloseRecipe.propTypes = {}

const policy = () => ({
    _: 'allow'
})

export default (
    activatable({id: 'closeRecipeDialog', policy})(
        activator('saveRecipeDialog')(
            CloseRecipe
        )
    )
)
