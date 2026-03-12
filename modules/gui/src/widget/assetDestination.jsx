import PropTypes from 'prop-types'
import React from 'react'
import {catchError, map, of} from 'rxjs'

import api from '~/apiRegistry'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {copyToClipboard} from '~/clipboard'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {toSafeString} from '~/string'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {currentUser} from '~/user'
import {Form} from '~/widget/form'

import {withActivators} from './activation/activator'
import {AssetDestinationBrowser} from './assetDestinationBrowser'
import {Button} from './button'

const mapStateToProps = state => ({
    projects: selectFrom(state, 'process.projects'),
    assetRoots: selectFrom(state, 'assets.roots')
})

const mapRecipeToProps = recipe => ({
    user: currentUser(),
    projectId: recipe.projectId,
    recipeName: recipe.title || recipe.placeholder
})

class _AssetDestination extends React.Component {
    checking = false
    metadataLoad = null
    validationSequence = 0

    state = {
        currentType: undefined,
        checking: false
    }

    constructor(props) {
        super(props)
        this.onLoading = this.onLoading.bind(this)
        this.onError = this.onError.bind(this)
        this.onChange = this.onChange.bind(this)
        this.copyIdToClipboard = this.copyIdToClipboard.bind(this)
        this.openAssetBrowser = this.openAssetBrowser.bind(this)
    }

    render() {
        return (
            <React.Fragment>
                {this.renderAssetInput()}
                {this.renderAssetBrowser()}
            </React.Fragment>
        )
    }

    renderAssetInput() {
        const {assetRoots, assetInput, type, label, placeholder, autoFocus} = this.props
        const {checking} = this.state
        return (
            <Form.AssetInput
                input={assetInput}
                label={label}
                placeholder={placeholder}
                autoFocus={autoFocus}
                busyMessage={!assetRoots || checking}
                preferredTypes={[type]}
                buttons={[
                    this.renderCopyIdButton(),
                    this.renderAssetBrowserButton()
                ]}
                labelButtons={[this.renderStrategy()]}
                destination
                onLoading={this.onLoading}
                onLoaded={({asset, metadata} = {}) => this.onLoaded({asset, currentType: metadata?.type})}
                onError={this.onError}
            />
        )
    }

    renderAssetBrowser() {
        return (
            <AssetDestinationBrowser
                onChange={this.onChange}
            />
        )
    }

    renderAssetBrowserButton() {
        return (
            <Button
                key='expand'
                chromeless
                shape='none'
                air='none'
                icon='folder-open'
                tooltip={msg('asset.browser.tooltip')}
                tabIndex={-1}
                onClick={this.openAssetBrowser}
            />
        )
    }

    openAssetBrowser() {
        const {assetInput, activator: {activatables: {assetBrowser}}} = this.props
        assetBrowser.activate({assetId: assetInput.value})
    }

    renderCopyIdButton() {
        const {assetInput: {value}} = this.props
        return (
            <Button
                key='copyId'
                chromeless
                shape='none'
                air='none'
                icon='copy'
                tooltip={msg('asset.copyId.tooltip')}
                tabIndex={-1}
                disabled={!value}
                onClick={this.copyIdToClipboard}
            />
        )
    }

    copyIdToClipboard() {
        const {assetInput: {value}} = this.props
        copyToClipboard(value, msg('asset.copyId.success'))
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

    onChange(assetId) {
        const {assetInput} = this.props
        assetInput.set(assetId)
    }

    componentDidMount() {
        const {assetRoots, assetInput} = this.props
        if (!assetInput.value) {
            if (assetRoots) {
                assetInput.set(this.defaultAssetId() || null)
            }
        } else {
            this.startValidation()
        }
    }

    componentDidUpdate(prevProps) {
        const {assetRoots, assetInput, strategyInput, type} = this.props
        const {currentType} = this.state
        if (!prevProps.assetRoots && assetRoots && !assetInput.value) {
            assetInput.set(this.defaultAssetId() || null)
        }
        if (prevProps.assetInput?.value !== assetInput.value) {
            assetInput.value
                ? this.startValidation()
                : this.cancelValidation()
        }
        if (currentType && strategyInput.value && assetInput.error) {
            assetInput.setInvalid(null)
        }
        if (prevProps.type !== type && strategyInput.value === 'resume') {
            // Switching type and resume strategy, we have to reset it prevent invalid strategy
            strategyInput.set(null)
            this.onLoaded({
                asset: assetInput.value,
                currentType,
                validationSequence: this.startValidation()
            })
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

    checkTaskConflict$(assetId) {
        return api.tasks.listExisting$({
            outputPath: assetId,
            destination: 'GEE',
            status: 'PENDING,ACTIVE'
        }).pipe(
            map(tasks => ({conflict: tasks?.length > 0})),
            catchError(error => of({error}))
        )
    }

    onLoading(asset) {
        const {strategyInput} = this.props
        this.metadataLoad = {
            asset,
            validationSequence: this.validationSequence
        }
        strategyInput.set(null)
        this.setState({currentType: null})
    }

    onLoaded({asset, currentType, validationSequence = this.metadataLoad?.validationSequence ?? this.validationSequence} = {}) {
        const {assetInput} = this.props
        if (validationSequence !== this.validationSequence || asset !== assetInput.value) {
            return
        }
        this.setState({currentType})
        this.validateConflict(asset, validationSequence, currentType)
    }

    onError(error) {
        const {assetInput, onError} = this.props
        const validationSequence = this.metadataLoad?.validationSequence ?? this.validationSequence
        if (validationSequence !== this.validationSequence) {
            return true
        }
        if (error.status === 404) {
            this.validateConflict(assetInput.value, validationSequence)
            return true
        } else {
            this.completeValidation(validationSequence, () => {
                if (!onError) {
                    assetInput.setInvalid(msg('widget.assetDestination.loadError'))
                }
            })
            onError && onError(error)
            return false
        }
    }

    validateConflict(asset, validationSequence, currentType) {
        const {addSubscription, assetInput, strategyInput} = this.props
        addSubscription(
            this.checkTaskConflict$(asset).subscribe(({error, conflict}) =>
                this.completeValidation(validationSequence, () => {
                    if (error) {
                        assetInput.setInvalid(msg('widget.assetDestination.loadError'))
                    } else if (conflict) {
                        assetInput.setInvalid(msg('widget.assetDestination.taskPending'))
                    } else if (currentType) {
                        assetInput.setInvalid(msg(
                            ['Image', 'ImageCollection'].includes(currentType)
                                ? 'widget.assetDestination.exists.replaceable'
                                : 'widget.assetDestination.exists.notReplaceable'
                        ))
                    } else {
                        assetInput.setInvalid(null)
                        strategyInput.set('new')
                    }
                })
            )
        )
    }

    startValidation() {
        const {assetInput} = this.props
        this.validationSequence += 1
        assetInput.setInvalid(null)
        this.setChecking(true)
        return this.validationSequence
    }

    cancelValidation() {
        this.validationSequence += 1
        this.setChecking(false)
    }

    completeValidation(validationSequence, callback) {
        if (validationSequence !== this.validationSequence) {
            return
        }
        callback && callback()
        this.metadataLoad = null
        this.setChecking(false)
    }

    setChecking(checking) {
        if (this.checking === checking) {
            return
        }
        this.checking = checking
        this.setState({checking})
        this.notifyValidityCheckChange(checking)
    }

    notifyValidityCheckChange(checking) {
        const {onValidityCheckChange} = this.props
        onValidityCheckChange && onValidityCheckChange(checking)
    }
}

export const AssetDestination = compose(
    _AssetDestination,
    withSubscriptions(),
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps),
    withActivators('assetBrowser')
)

AssetDestination.propTypes = {
    assetInput: PropTypes.object.isRequired,
    strategyInput: PropTypes.object.isRequired,
    type: PropTypes.any.isRequired,
    label: PropTypes.any,
    placeholder: PropTypes.string,
    tooltip: PropTypes.any,
    onValidityCheckChange: PropTypes.func
}
