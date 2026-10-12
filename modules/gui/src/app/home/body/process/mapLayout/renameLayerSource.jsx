import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Panel} from '~/widget/panel/panel'

import {getImageLayerSource} from '../imageLayerSourceRegistry'
import {withRecipe} from '../recipeContext'
import {layerSourceName, renameLayerSource} from './layerSourceNames'
import styles from './selectAsset.module.css'

const fields = {
    name: new Form.Field()
}

// Names a layer source the layout does not own, opened with the `source` to name. What it shows stays fixed; left blank,
// the source is called what its type calls it, which the input offers as its placeholder.
class _RenameLayerSource extends React.Component {
    constructor(props) {
        super(props)
        this.apply = this.apply.bind(this)
    }

    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header title={msg('map.layout.renameImageLayerSource.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                        <Panel.Buttons.Apply keybinding='Enter' onClick={this.apply}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderContent() {
        const {recipe, inputs: {name}, activatable: {source}} = this.props
        return (
            <Form.Input
                input={name}
                label={msg('map.layout.renameImageLayerSource.name.label')}
                placeholder={getImageLayerSource({recipe, source}).description}
                autoFocus
            />
        )
    }

    apply() {
        const {recipeId, inputs: {name}, activatable: {deactivate, source}} = this.props
        renameLayerSource({recipeId, sourceId: source.id, name: name.value})
        deactivate()
    }
}

// The form starts from the name the source was given, if any.
const withSourceName = WrappedComponent => {
    const WithSourceName = props => {
        const {recipe, activatable: {source} = {}} = props
        return React.createElement(WrappedComponent, {...props, values: {name: layerSourceName(recipe, source?.id) || ''}})
    }
    return WithSourceName
}

const policy = () => ({
    _: 'allow'
})

export const RenameLayerSource = compose(
    _RenameLayerSource,
    withForm({fields}),
    withSourceName,
    withRecipe(recipe => ({recipe})),
    withActivatable({id: 'renameLayerSource', policy, alwaysAllow: true})
)
