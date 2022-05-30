import {AssetInput} from './assetInput'
import {Form} from 'widget/form/form'
import {Layout} from './layout'
import {compose} from 'compose'
import {connect} from 'store'
import {currentUser} from 'user'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = state => ({
    projects: selectFrom(state, 'process.projects'),
    assetRoots: selectFrom(state, 'gee.assetRoots')
})

const mapRecipeToProps = recipe => ({
    user: currentUser(),
    projectId: recipe.projectId,
    title: recipe.title,
    placeholder: recipe.placeholder
})

class _AssetDestination extends React.Component {
    state = {
        currentType: undefined
    }

    constructor(props) {
        super(props)
        this.onLoading = this.onLoading.bind(this)
        this.onError = this.onError.bind(this)
    }

    render() {
        const {currentType} = this.state
        return (
            <Layout spacing='tight'>
                {this.renderAssetInput()}
                {['Image', 'ImageCollection'].includes(currentType) ? this.renderStrategy() : null}
            </Layout>
        )
    }

    renderAssetInput() {
        const {assetInput, label, placeholder, autoFocus} = this.props
        return (
            <AssetInput
                input={assetInput}
                label={label}
                placeholder={placeholder}
                autoFocus={autoFocus}
                onLoading={this.onLoading}
                onLoaded={({metadata} = {}) => this.onLoaded(metadata?.type)}
                onError={this.onError}
            />
        )
    }

    renderStrategy() {
        const {strategyInput, type} = this.props
        const {currentType} = this.state
        const options = [
            {
                value: 'resume',
                label: msg('widget.assetDestination.resume.label'),
                tooltip: msg('widget.assetDestination.resume.tooltip'),
                disabled: !currentType || type !== 'ImageCollection'
            },
            {
                value: 'replace',
                label: msg('widget.assetDestination.replace.label'),
                tooltip: msg('widget.assetDestination.replace.tooltip')
            }
        ].filter(({value}) => value !== 'resume' || type === 'ImageCollection')
        return (
            <Form.Buttons
                input={strategyInput}
                options={options}
                size='x-small'
                alignment='right'
                shape='pill'
                air='less'
            />
        )
    }

    componentDidMount() {
        const {assetInput, assetRoots} = this.props
        if (assetRoots && assetRoots.length && !assetInput.value) {
            assetInput.set(`${assetRoots[0]}/${this.defaultPath()}`)
        }
    }

    componentDidUpdate(prevProps) {
        const {assetInput, strategyInput, type} = this.props
        const {currentType} = this.state
        if (currentType && strategyInput.value && assetInput.error) {
            assetInput.setInvalid(null)
        }
        if (prevProps.type !== type && strategyInput.value === 'resume') {
            // Switching type and resume strategy, we have to reset it prevent invalid strategy
            strategyInput.set(null)
            this.onLoaded(currentType)
        }
    }

    defaultPath() {
        const {projects, projectId, title, placeholder} = this.props
        const projectDir = projects
            .find(({id}) => id === projectId)
            ?.name
            ?.replace(/[^\w-.]/g, '_')
        const recipeName = title || placeholder
        return projectDir
            ? `${projectDir}/${recipeName}`
            : recipeName
    }

    onLoading() {
        const {strategyInput} = this.props
        strategyInput.set(null)
        this.setState({currentType: null})
    }

    onLoaded(currentType) {
        const {assetInput, strategyInput} = this.props
        this.setState({currentType})
        if (currentType) {
            assetInput.setInvalid(msg(
                ['Image', 'ImageCollection'].includes(currentType)
                    ? 'widget.assetDestination.exists.replacable'
                    : 'widget.assetDestination.exists.notReplacable'
            ))
        } else {
            strategyInput.set('new')
        }
    }

    onError(error) {
        const {assetInput, onError} = this.props
        if (error.status === 404) {
            this.onLoaded()
        } else {
            onError && onError(error)
            assetInput.setInvalid(
                error.response && error.response.messageKey
                    ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                    : msg('widget.assetInput.loadError')
            )
        }
    }
}

export const AssetDestination = compose(
    _AssetDestination,
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps)
)

AssetDestination.propTypes = {
    assetInput: PropTypes.object.isRequired,
    strategyInput: PropTypes.object.isRequired,
    type: PropTypes.any.isRequired,
    label: PropTypes.any,
    tooltip: PropTypes.any,
    placeholder: PropTypes.string
}
