import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {closeRecipe} from './recipe'
import {msg} from 'translate'
import React from 'react'
import styles from './closeRecipe.module.css'

class CloseRecipe extends React.Component {
    render() {
        const {activator: {activatables: saveRecipeDialog}, activatable} = this.props
        const recipe = activatable.recipe
        const title = recipe.title || recipe.placeholder
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
                <PanelButtons>
                    <PanelButtons.Main>
                        <PanelButtons.Cancel
                            onClick={() => activatable.deactivate()}/>
                        <PanelButtons.Save
                            dots
                            onClick={() => {
                                activatable.deactivate()
                                saveRecipeDialog.activate({recipe, closeTabOnSave: true})
                            }}/>
                    </PanelButtons.Main>
                    <PanelButtons.Extra>
                        <PanelButtons.Discard
                            onClick={() => {
                                activatable.deactivate()
                                closeRecipe(activatable.recipe.id)
                            }}/>
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
    activatable('closeRecipeDialog', policy)(
        activator(['saveRecipeDialog'])(
            CloseRecipe
        )
    )
)
