import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {Subject} from 'rxjs'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {connect, select} from 'store'
import {get$} from 'http-client'
import {msg} from 'translate'
import {takeUntil} from 'rxjs/operators'
import {v4 as uuid} from 'uuid'
import {withRecipe} from '../recipeContext'
import React from 'react'
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

    render() {
        const {activatable: {deactivate}} = this.props
        const {validatedApiKey} = this.state
        return (
            <Panel type='modal' className={styles.panel}>
                <Panel.Header title={msg('map.layout.addImageLayerSource.types.Planet.description')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons onEnter={() => this.add()} onEscape={deactivate}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel onClick={deactivate}/>
                        <Panel.Buttons.Add
                            disabled={!validatedApiKey}
                            onClick={() => this.add()}
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
                    errorMessage
                />
                <Form.Input
                    label={msg('map.layout.addImageLayerSource.types.Planet.form.apiKey.label')}
                    input={planetApiKey}
                    spellCheck={false}
                    onChangeDebounced={apiKey => this.validateApiKey(apiKey)}
                    busyMessage={this.props.stream('VALIDATE_API_KEY').active && msg('widget.loading')}
                    errorMessage
                />
            </Layout>
        )
    }

    validateApiKey(apiKey) {
        this.apiKeyChanged$.next()
        this.setState({validatedApiKey: null},
            this.props.stream('VALIDATE_API_KEY',
                this.validateApiKey$(apiKey).pipe(
                    takeUntil(this.apiKeyChanged$)),
                () => this.setState({validatedApiKey: apiKey}),
                () => {
                    this.props.inputs.planetApiKey.setInvalid(
                        msg('map.layout.addImageLayerSource.types.Planet.form.invalidApiKey')
                    )
                }
            )
        )
    }

    validateApiKey$(apiKey) {
        return get$('https://api.planet.com/basemaps/v1/mosaics', {
            username: apiKey,
            crossDomain: true
        })
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
    form({fields}),
    withRecipe(),
    activatable({id: 'selectPlanet', policy, alwaysAllow: true}),
    connect(mapStateToProps)
)
