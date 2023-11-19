import {Form} from 'widget/form/form'
import {compose} from 'compose'
import {connect} from 'store'
import {currentUser} from 'user'
import {map} from 'rxjs'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {toSafeString} from 'string'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'

const mapStateToProps = state => ({
    projects: selectFrom(state, 'process.projects'),
    assetRoots: selectFrom(state, 'gee.assetRoots')
})

const mapRecipeToProps = recipe => ({
    user: currentUser(),
    projectId: recipe.projectId,
    recipeName: recipe.title || recipe.placeholder
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
        const {stream, assetInput, type, label, placeholder, autoFocus} = this.props
        return (
            <Form.AssetCombo
                input={assetInput}
                label={label}
                placeholder={placeholder}
                autoFocus={autoFocus}
                busyMessage={stream('UPDATE_ASSET_ROOTS').active}
                preferredTypes={[type]}
                labelButtons={[this.renderStrategy()]}
                destination
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
                tooltip: msg('widget.assetDestination.resume.tooltip')
            },
            {
                value: 'replace',
                label: msg('widget.assetDestination.replace.label'),
                tooltip: msg('widget.assetDestination.replace.tooltip')
            }
        ].filter(({value}) => value !== 'resume' || (type === 'ImageCollection' && currentType === 'ImageCollection'))
        const show = ['Image', 'ImageCollection'].includes(currentType)
        return show ? (
            <Form.Buttons
                key='strategy'
                input={strategyInput}
                options={options}
                size='x-small'
                alignment='right'
                shape='pill'
                air='less'
            />
        ) : null
    }

    componentDidMount() {
        const {assetRoots, assetInput, stream} = this.props
        if (!assetInput.value) {
            if (assetRoots) {
                assetInput.set(this.defaultAssetId() || null)
            } else {
                stream('UPDATE_ASSET_ROOTS', updateAssetRoots$())
            }
        }
    }

    componentDidUpdate(prevProps) {
        const {assetRoots, assetInput, strategyInput, type} = this.props
        const {currentType} = this.state
        if (!prevProps.assetRoots && assetRoots && !assetInput.value) {
            assetInput.set(this.defaultAssetId() || null)
        }
        if (currentType && strategyInput.value && assetInput.error) {
            assetInput.setInvalid(null)
        }
        if (prevProps.type !== type && strategyInput.value === 'resume') {
            // Switching type and resume strategy, we have to reset it prevent invalid strategy
            strategyInput.set(null)
            this.onLoaded(currentType)
        }
    }

    defaultAssetId() {
        const {assetRoots, recipeName} = this.props
        const project = this.findProject()
        if (project?.defaultAssetFolder) {
            return `${project.defaultAssetFolder}/${recipeName}`
        } else if (assetRoots && assetRoots.length) {
            if (project) {
                const projectDir = toSafeString(project?.name)
                return `${assetRoots[0]}/${projectDir}/${recipeName}`
            } else {
                return `${assetRoots[0]}/${recipeName}`
            }
        }
    }

    findProject() {
        const {projects, projectId} = this.props
        return projects.find(({id}) => id === projectId)
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
                    ? 'widget.assetDestination.exists.replaceable'
                    : 'widget.assetDestination.exists.notReplaceable'
            ))
        } else {
            strategyInput.set('new')
        }
    }

    onError(error) {
        const {strategyInput} = this.props
        const {onError} = this.props
        if (error.status === 404) {
            strategyInput.set('new')
            return true
        } else {
            onError && onError(error)
            return false
        }
    }
}

const updateAssetRoots$ = () =>
    api.gee.assetRoots$().pipe(
        map(assetRoots =>
            actionBuilder('UPDATE_ASSET_ROOTS')
                .set('gee.assetRoots', assetRoots)
                .dispatch()
        )
    )

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
    placeholder: PropTypes.string,
    tooltip: PropTypes.any
}
