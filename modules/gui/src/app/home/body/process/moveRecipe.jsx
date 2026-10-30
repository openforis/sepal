import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {Panel} from '~/widget/panel/panel'

import styles from './moveRecipe.module.css'
import {moveItems} from './recipeList/folderActions'
import {FolderPicker} from './recipeList/folderPicker'
import {at} from './recipeList/recipeTree'

const EMPTY_ARRAY = []

const mapStateToProps = () => ({
    folders: select('process.folders') ?? EMPTY_ARRAY
})

class _MoveRecipe extends React.Component {
    constructor(props) {
        super(props)
        this.state = {folderId: at(props.activatable.recipe.folderId)}
    }

    render() {
        const {folders, activatable: {recipe, deactivate}} = this.props
        const {folderId} = this.state
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header
                    icon='shuffle'
                    title={msg('process.menu.moveRecipe.title')}/>
                <Panel.Content>
                    <FolderPicker
                        className={styles.picker}
                        folders={folders}
                        folderId={recipe.folderId}
                        onNavigate={folderId => this.setState({folderId})}
                    />
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}/>
                        <Panel.Buttons.Confirm
                            label={msg('process.folder.selectHere')}
                            keybinding='Enter'
                            onClick={() => this.move(folderId)}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    // The dialog closes before the move lands, so the move is not tied to it. Like every move in the list,
    // this one offers its way back.
    move(folderId) {
        const {activatable: {recipe, deactivate}} = this.props
        deactivate()
        if (at(folderId) !== at(recipe.folderId)) {
            moveItems([{kind: 'recipe', id: recipe.id, folderId: recipe.folderId}], folderId)
        }
    }
}

const policy = () => ({
    _: 'allow'
})

export const MoveRecipe = compose(
    _MoveRecipe,
    connect(mapStateToProps),
    withActivatable({id: 'moveRecipeDialog', policy})
)

MoveRecipe.propTypes = {}
