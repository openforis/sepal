import _ from 'lodash'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../recipeContext'
import {updateLayerSource, withSourceValues} from './layerSourceEdit'
import styles from './selectPlanet.module.css'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

const fields = {
    description: new Form.Field().notBlank(),
    planetApiKey: new Form.Field().notBlank()
}

// Opened with a `source` to edit, the form starts from that source, whose API key is already validated.
class _SelectPlanet extends React.Component {
    apiKeyChanged$ = new Subject()

    constructor(props) {
        super(props)
        this.add = this.add.bind(this)
        this.apply = this.apply.bind(this)
        const {activatable: {source}} = props
        this.state = {validatedApiKey: source?.sourceConfig.planetApiKey}
    }

    render() {
        const {activatable: {deactivate, source}} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header title={source
                    ? msg('map.layout.editImageLayerSource.types.Planet.description')
                    : msg('map.layout.addImageLayerSource.types.Planet.description')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                        {this.renderConfirmButton()}
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderConfirmButton() {
        const {activatable: {source}} = this.props
        const {validatedApiKey} = this.state
        return source
            ? <Panel.Buttons.Apply disabled={!validatedApiKey} keybinding='Enter' onClick={this.apply}/>
            : <Panel.Buttons.Add disabled={!validatedApiKey} keybinding='Enter' onClick={this.add}/>
    }

    renderContent() {
        const {inputs: {description, planetApiKey}} = this.props
        return (
            <Layout>
                <Form.Input
                    label={msg('map.layout.addImageLayerSource.types.Planet.form.description.label')}
                    input={description}
                    autoFocus
                />
                <Form.Input
                    label={msg('map.layout.addImageLayerSource.types.Planet.form.apiKey.label')}
                    input={planetApiKey}
                    spellCheck={false}
                    onChangeDebounced={apiKey => this.validateApiKey(apiKey)}
                    busyMessage={this.props.stream('VALIDATE_API_KEY').active && msg('widget.loading')}
                />
            </Layout>
        )
    }

    validateApiKey(apiKey) {
        this.apiKeyChanged$.next()
        this.setState({validatedApiKey: null},
            () => this.props.stream('VALIDATE_API_KEY',
                api.planet.validateApiKey$(apiKey).pipe(
                    takeUntil(this.apiKeyChanged$)),
                () => this.setState({validatedApiKey: apiKey}),
                () => this.props.inputs.planetApiKey.setInvalid(
                    msg('map.layout.addImageLayerSource.types.Planet.form.invalidApiKey')
                )
            )
        )
    }

    add() {
        const {inputs: {description}} = this.props
        const {validatedApiKey} = this.state
        const {recipeActionBuilder, activatable: {deactivate}} = this.props
        recipeActionBuilder('ADD_PLANET_IMAGE_LAYER_SOURCE')
            .push('layers.additionalImageLayerSources', {
                id: uuid(),
                type: 'Planet',
                sourceConfig: {
                    description: description.value,
                    planetApiKey: validatedApiKey
                }
            })
            .dispatch()
        deactivate()
    }

    // A mosaic chosen in an area is one the previous key could reach; with another key, the area's layer picks its
    // default mosaic again.
    apply() {
        const {inputs: {description}, recipeId, activatable: {deactivate, source}} = this.props
        const {validatedApiKey} = this.state
        const sameKey = validatedApiKey === source.sourceConfig.planetApiKey
        updateLayerSource({
            recipeId,
            sourceId: source.id,
            sourceConfig: {...source.sourceConfig, description: description.value, planetApiKey: validatedApiKey},
            reconcileLayerConfig: layerConfig => sameKey || !layerConfig ? layerConfig : _.omit(layerConfig, 'urlTemplate')
        })
        deactivate()
    }
}

const sourceValues = source => ({
    description: source.sourceConfig.description,
    planetApiKey: source.sourceConfig.planetApiKey
})

const policy = () => ({
    _: 'allow'
})

export const SelectPlanet = compose(
    _SelectPlanet,
    withForm({fields}),
    withSourceValues(sourceValues),
    withRecipe(),
    withActivatable({id: 'selectPlanet', policy, alwaysAllow: true}),
    connect(mapStateToProps)
)
