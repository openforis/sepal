import {Form, withForm} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {Subject, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import {v4 as uuid} from 'uuid'
import {withActivatable} from 'widget/activation/activatable'
import {withRecipe} from '../recipeContext'
import React from 'react'
import api from 'api'
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

class _SelectPlanet extends React.Component {
    state = {}
    apiKeyChanged$ = new Subject()

    constructor(props) {
        super(props)
        this.add = this.add.bind(this)
    }

    render() {
        const {activatable: {deactivate}} = this.props
        const {validatedApiKey} = this.state
        return (
            <Panel type='modal' className={styles.panel}>
                <Panel.Header title={msg('map.layout.addImageLayerSource.types.Planet.description')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                        <Panel.Buttons.Add
                            disabled={!validatedApiKey}
                            keybinding='Enter'
                            onClick={this.add}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
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
            this.props.stream('VALIDATE_API_KEY',
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

}

const policy = () => ({
    _: 'allow'
})

export const SelectPlanet = compose(
    _SelectPlanet,
    withForm({fields}),
    withRecipe(),
    withActivatable({id: 'selectPlanet', policy, alwaysAllow: true}),
    connect(mapStateToProps)
)
