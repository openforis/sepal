import Path from 'path'
import PropTypes from 'prop-types'
import React from 'react'
import {of} from 'rxjs'

import {
    physicalDestinationCompatibility,
    VALID_SELECTION
} from '#sepal/recipe/output/physicalDestinationCompatibility'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {updateProject} from '~/app/home/body/process/recipeList/projects'
import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {isEqual} from '~/hash'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {isGoogleAccount} from '~/user'
import {AssetDestination} from '~/widget/assetDestination'
import {Button} from '~/widget/button'
import {Buttons} from '~/widget/buttons'
import {Form} from '~/widget/form'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {Message} from '~/widget/message'
import {NoData} from '~/widget/noData'
import {NumberButtons} from '~/widget/numberButtons'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'
import {WorkspaceDestination} from '~/widget/workspaceDestination'

import styles from './retrievePanel.module.css'

const fields = {
    useAllBands: new Form.Field(),
    bands: new Form.Field()
        .skip((v, {useAllBands}) => useAllBands)
        .predicate(bands => bands && bands.length, 'process.retrieve.form.bands.atLeastOne'),
    scale: new Form.Field()
        .int()
        .notBlank(),
    destination: new Form.Field()
        .notEmpty('process.retrieve.form.destination.required'),
    workspacePath: new Form.Field()
        .skip((v, {destination}) => destination !== 'SEPAL')
        .notBlank(),
    assetId: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .notBlank(),
    assetType: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .notBlank(),
    sharing: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .notBlank(),
    strategy: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .notBlank(),
    shardSize: new Form.Field()
        .int()
        .notBlank(),
    fileDimensionsMultiple: new Form.Field()
        .skip((v, {destination}) => destination !== 'SEPAL')
        .int()
        .notBlank(),
    tileSize: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .number()
        .notBlank(),
    filenamePrefix: new Form.Field()
        .skip((v, {destination}) => destination !== 'SEPAL'),
    crs: new Form.Field()
        .notBlank(),
    crsTransform: new Form.Field()
}

const DECLARED_CHOICES = 'DECLARED_CHOICES'
const LOADING_CHOICES = 'LOADING_CHOICES'
const UNRESOLVED_CHOICES = 'UNRESOLVED_CHOICES'
const RESOLVED_CHOICES = 'RESOLVED_CHOICES'

// A resolution that answers almost at once would otherwise replace the opening view before it could be read.
const MINIMUM_LOADING_MS = 500

const constraints = {
    fileDimensionsMultipleSize: new Form.Constraint(['fileDimensionsMultiple', 'shardSize'])
        .skip(({destination}) => destination !== 'SEPAL')
        .predicate(({fileDimensionsMultiple, shardSize}) =>
            fileDimensionsMultiple * shardSize <= 131072, 'process.retrieve.form.fileDimensionsMultiple.tooLarge'
        )
}

const mapStateToProps = state => ({
    projects: selectFrom(state, 'process.projects')
})

const mapRecipeToProps = recipe => ({
    projectId: recipe.projectId,
    recipeTitle: recipe.title,
    recipePlaceholder: recipe.placeholder
})

class _MosaicRetrievePanel extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            more: false,
            destinationValidationPending: this.requiresDestinationValidation(props),
            destinationReconciliation: null,
            imageOutputResolutionKey: props.imageOutputResolution?.key,
            imageOutputTerminal: null,
            initialLoadingDone: false
        }
        this.imageOutputOperation = null
        this.minimumLoadingElapsed = false
        this.initialLoadingTimer = null
        this.mounted = false
        this.onBandsChange = this.onBandsChange.bind(this)
        this.onDestinationChange = this.onDestinationChange.bind(this)
        this.onDestinationValidityCheckChange = this.onDestinationValidityCheckChange.bind(this)
    }

    render() {
        const {className, form} = this.props
        const {more, destinationValidationPending, destinationReconciliation} = this.state
        const invalid = this.isInitialLoading()
            || destinationValidationPending
            || Boolean(destinationReconciliation)
            || this.resolvedOutputBlocksSubmission()
            || form.isInvalid()
        return (
            <RecipeFormPanel
                className={[styles.panel, className].join(' ')}
                placement='top-right'
                isActionForm
                onApply={values => {
                    const {fileDimensionsMultiple, shardSize} = values
                    return this.retrieve({...values, fileDimensions: fileDimensionsMultiple * shardSize})
                }}>
                <Panel.Header
                    icon='cloud-download-alt'
                    title={msg('process.retrieve.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons
                    applyLabel={msg('process.retrieve.apply')}
                    invalid={invalid}>
                    <Button
                        label={more ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setState({more: !more})}
                    />
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {allBands, allowTiling, toSepal, toEE, inputs: {destination, assetType}} = this.props
        const {more} = this.state
        if (this.isInitialLoading()) {
            return this.renderLoading()
        }
        return (
            <Layout>
                {allBands ? null : this.renderBandOptions()}
                {this.renderScale()}
                {toEE && toSepal && this.renderDestination()}
                {destination.value === 'SEPAL' ? this.renderWorkspaceDestination() : null}
                {destination.value === 'SEPAL' ? this.renderFilenamePrefix() : null}
                {destination.value === 'GEE' ? this.renderAssetType() : null}
                {destination.value === 'GEE' ? this.renderAssetDestination() : null}
                {destination.value === 'GEE' ? this.renderSharing() : null}
                {more && (allowTiling || (destination.value === 'GEE' && assetType.value === 'ImageCollection')) ? this.renderTileSize() : null}
                {more ? this.renderShardSize() : null}
                {more && destination.value === 'SEPAL' ? this.renderFileDimensionsMultiple() : null}
                <Layout type='horizontal'>
                    {more ? this.renderCrs() : null}
                    {more ? this.renderCrsTransform() : null}
                </Layout>
            </Layout>
        )
    }

    renderLoading() {
        return (
            <NoData
                alignment='left'
                message={(
                    <div>
                        <Icon name='spinner'/>
                        {' ' + msg('process.retrieve.form.bands.loading')}
                    </div>
                )}
            />
        )
    }

    renderCrs() {
        const {inputs: {crs}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.crs.label')}
                placeholder={msg('process.retrieve.form.crs.placeholder')}
                tooltip={msg('process.retrieve.form.crs.tooltip')}
                input={crs}
            />
        )
    }

    renderCrsTransform() {
        const {inputs: {crsTransform}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.crsTransform.label')}
                placeholder={msg('process.retrieve.form.crsTransform.placeholder')}
                tooltip={msg('process.retrieve.form.crsTransform.tooltip')}
                input={crsTransform}
            />
        )
    }

    renderShardSize() {
        const {inputs: {shardSize}} = this.props
        return (
            <NumberButtons
                label={msg('process.retrieve.form.shardSize.label')}
                placeholder={msg('process.retrieve.form.shardSize.placeholder')}
                tooltip={msg('process.retrieve.form.shardSize.tooltip')}
                input={shardSize}
                options={[4, 16, 32, 64, 128, 256, 512, {value: 1024, label: '1k'}]}
                suffix={msg('process.retrieve.form.shardSize.suffix')}
            />
        )
    }

    renderFileDimensionsMultiple() {
        const {inputs: {fileDimensionsMultiple}} = this.props
        return (
            <NumberButtons
                label={msg('process.retrieve.form.fileDimensionsMultiple.label')}
                placeholder={msg('process.retrieve.form.fileDimensionsMultiple.placeholder')}
                tooltip={msg('process.retrieve.form.fileDimensionsMultiple.tooltip')}
                input={fileDimensionsMultiple}
                options={[1, 2, 3, 4, 5, 10, 20, 50, 100]}
                suffix={msg('process.retrieve.form.fileDimensionsMultiple.suffix')}
                errorMessage={[fileDimensionsMultiple, 'fileDimensionsMultipleSize']}
            />
        )
    }

    renderTileSize() {
        const {inputs: {tileSize}} = this.props
        return (
            <NumberButtons
                label={msg('process.retrieve.form.tileSize.label')}
                placeholder={msg('process.retrieve.form.tileSize.placeholder')}
                tooltip={msg('process.retrieve.form.tileSize.tooltip')}
                input={tileSize}
                options={[0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10]}
                suffix={msg('process.retrieve.form.tileSize.suffix')}
            />
        )
    }

    renderDestination() {
        const {toSepal, toEE, toDrive, inputs: {destination}} = this.props
        const compatibility = this.getPhysicalDestinationCompatibility()
        const destinationOptions = [
            {
                value: 'GEE',
                label: msg('process.retrieve.form.destination.GEE')
            },
            {
                value: 'DRIVE',
                label: msg('process.retrieve.form.destination.DRIVE')
            },
            {
                value: 'SEPAL',
                label: msg('process.retrieve.form.destination.SEPAL')
            }
        ]
            .filter(({value}) => isGoogleAccount() || value === 'SEPAL')
            .filter(({value}) => toSepal || value !== 'SEPAL')
            .filter(({value}) => toEE || value !== 'GEE')
            .filter(({value}) => toDrive || value !== 'DRIVE')
            .map(option => ({
                ...option,
                ...(compatibility && compatibility.destinations[option.value] === false
                    ? {disabled: true}
                    : {})
            }))
        return (
            <Form.Buttons
                label={msg('process.retrieve.form.destination.label')}
                input={destination}
                multiple={false}
                options={destinationOptions}
                disabled={this.isDestinationControlDisabled()}
                onChange={this.onDestinationChange}/>
        )
    }

    renderWorkspaceDestination() {
        const {inputs: {workspacePath}} = this.props
        return (
            <WorkspaceDestination
                label={msg('process.retrieve.form.workspacePath.label')}
                placeholder={msg('process.retrieve.form.workspacePath.placeholder')}
                tooltip={msg('process.retrieve.form.workspacePath.tooltip')}
                workspacePathInput={workspacePath}
                onValidityCheckChange={this.onDestinationValidityCheckChange}
            />
        )
    }
    
    renderFilenamePrefix() {
        const {inputs: {filenamePrefix}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.filenamePrefix.label')}
                placeholder={msg('process.retrieve.form.filenamePrefix.placeholder')}
                tooltip={msg('process.retrieve.form.filenamePrefix.tooltip')}
                input={filenamePrefix}
            />
        )
    }

    renderAssetDestination() {
        const {inputs: {assetId, assetType, strategy}} = this.props
        return (
            <AssetDestination
                type={assetType.value}
                label={msg('process.retrieve.form.assetId.label')}
                placeholder={msg('process.retrieve.form.assetId.placeholder')}
                tooltip={msg('process.retrieve.form.assetId.tooltip')}
                assetInput={assetId}
                strategyInput={strategy}
                onValidityCheckChange={this.onDestinationValidityCheckChange}
            />
        )
    }

    renderSharing() {
        const {inputs: {sharing}} = this.props
        const options = [
            {
                value: 'PRIVATE',
                label: msg('process.retrieve.form.sharing.PRIVATE.label'),
                tooltip: msg('process.retrieve.form.sharing.PRIVATE.tooltip')
            },
            {
                value: 'PUBLIC',
                label: msg('process.retrieve.form.sharing.PUBLIC.label'),
                tooltip: msg('process.retrieve.form.sharing.PUBLIC.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.retrieve.form.sharing.label')}
                input={sharing}
                multiple={false}
                options={options}/>
        )
    }

    renderAssetType() {
        const {inputs: {assetType}} = this.props
        const options = [
            {
                value: 'Image',
                label: msg('process.retrieve.form.assetType.Image.label'),
                tooltip: msg('process.retrieve.form.assetType.Image.tooltip')
            },
            {
                value: 'ImageCollection',
                label: msg('process.retrieve.form.assetType.ImageCollection.label'),
                tooltip: msg('process.retrieve.form.assetType.ImageCollection.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.retrieve.form.assetType.label')}
                input={assetType}
                multiple={false}
                options={options}/>
        )
    }

    renderBandOptions() {
        const {status, choices} = this.bandChoices()
        if (status === LOADING_CHOICES) {
            return null
        }
        if (status === UNRESOLVED_CHOICES) {
            return this.renderBandsMessage(msg('process.retrieve.error.imageOutput'), 'triangle-exclamation')
        }
        if (!choices?.length) {
            return null
        }
        const options = choices
            .filter(group => group.length)
            .map(group => ({options: group}))
        return status === DECLARED_CHOICES
            ? this.renderDeclaredBandOptions(options)
            : this.renderResolvedBandOptions(options)
    }

    // What a recipe type supplies is the whole truth here, so the control is free to drop a selected name its
    // options no longer carry.
    renderDeclaredBandOptions(options) {
        const {single, inputs: {bands}} = this.props
        return (
            <Form.Buttons
                label={msg('process.retrieve.form.bands.label')}
                input={bands}
                multiple={!single}
                options={options}
                framed
            />
        )
    }

    // The control is given the selection rather than the form field, because a name the catalogue does not
    // hold has to SURVIVE: it is what the warning names and what blocks retrieval, and dropping it would
    // submit a different export than the one the user saved. Only an edit of the selection removes it.
    renderResolvedBandOptions(options) {
        const {single, inputs: {bands}} = this.props
        const missing = this.missingSelection()
        return (
            <Layout spacing='compact'>
                <Buttons
                    label={msg('process.retrieve.form.bands.label')}
                    selected={bands.value}
                    multiple={!single}
                    options={options}
                    onChange={this.onBandsChange}
                    framed
                />
                {missing.length
                    ? (
                        <Message
                            type='warning'
                            icon='triangle-exclamation'
                            text={msg('process.retrieve.form.bands.unavailable', {bands: missing.join(', ')})}
                        />
                    )
                    : null}
            </Layout>
        )
    }

    renderBandsMessage(text, icon) {
        return (
            <Widget label={msg('process.retrieve.form.bands.label')} framed>
                <Message type='info' icon={icon} text={text}/>
            </Widget>
        )
    }

    renderScale() {
        const {scaleTicks, inputs: {scale}} = this.props
        return (
            <NumberButtons
                label={msg('process.retrieve.form.scale.label')}
                placeholder={msg('process.retrieve.form.scale.placeholder')}
                input={scale}
                options={scaleTicks}
                suffix={msg('process.retrieve.form.scale.suffix')}
            />
        )
    }
    
    componentDidMount() {
        this.mounted = true
        const {allBands, defaultAssetType, defaultCrs, defaultScale, defaultShardSize, defaultFileDimensionsMultiple, defaultTileSize,
            inputs: {assetType, sharing, crs, crsTransform, scale, shardSize, fileDimensionsMultiple, tileSize, useAllBands, filenamePrefix}
        } = this.props
        const more = (crs.value && crs.value !== defaultCrs)
            || (crsTransform.value)
            || (shardSize.value && shardSize.value !== defaultShardSize)
            || (fileDimensionsMultiple.value && fileDimensionsMultiple.value !== defaultFileDimensionsMultiple)
            || (tileSize.value && tileSize.value !== defaultTileSize)
        this.setState({more})
        if (!crs.value) {
            crs.set(defaultCrs)
        }
        if (!scale.value) {
            scale.set(defaultScale)
        }
        if (!shardSize.value) {
            shardSize.set(defaultShardSize)
        }
        if (!fileDimensionsMultiple.value) {
            fileDimensionsMultiple.set(defaultFileDimensionsMultiple)
        }
        if (!tileSize.value) {
            tileSize.set(defaultTileSize)
        }
        if (defaultAssetType && !assetType.value) {
            assetType.set(defaultAssetType)
        }
        if (!sharing.value) {
            sharing.set('PRIVATE')
        }
        if (allBands) {
            useAllBands.set(true)
        }
        if (!filenamePrefix.value) {
            const recipeName = this.getRecipeName()
            filenamePrefix.set(recipeName)
        }
        this.startImageOutputResolution()
        this.startMinimumLoading()
        this.update()
    }

    componentDidUpdate(prevProps) {
        if (!isEqual(prevProps.imageOutputResolution?.key, this.props.imageOutputResolution?.key)) {
            this.startImageOutputResolution()
        }
        if (prevProps.inputs.destination.value !== this.props.inputs.destination.value) {
            this.setDestinationValidationPending(this.requiresDestinationValidation())
        }
        this.update()
        this.reconcileDestination()
    }

    componentWillUnmount() {
        this.mounted = false
        this.stopImageOutputResolution()
        clearTimeout(this.initialLoadingTimer)
        this.initialLoadingTimer = null
    }

    startMinimumLoading() {
        this.initialLoadingTimer = setTimeout(() => {
            this.initialLoadingTimer = null
            this.minimumLoadingElapsed = true
            if (this.mounted) {
                this.settleInitialLoading(this.getImageOutputTerminal())
            }
        }, MINIMUM_LOADING_MS)
    }

    update() {
        const {toEE, toSepal, inputs: {destination, assetType}} = this.props
        const compatibility = this.getPhysicalDestinationCompatibility()
        if (!destination.value) {
            if (toEE && isGoogleAccount() && compatibility?.destinations.GEE !== false) {
                this.setDestinationValidationPending(true)
                destination.set('GEE')
            } else if (toSepal && compatibility?.destinations.SEPAL !== false) {
                this.setDestinationValidationPending(true)
                destination.set('SEPAL')
            }
        } else {
            if (destination.value === 'GEE' && !assetType.value) {
                assetType.set('Image')
            }
        }
    }

    retrieve(values) {
        const {onRetrieve} = this.props
        const terminal = this.getImageOutputTerminal()
        if (this.props.imageOutputResolution && (!terminal || this.resolvedOutputBlocksSubmission())) {
            return
        }
        const project = this.findProject()
        if (project) {
            const {assetId, workspacePath} = values
            updateProject({
                ...project,
                defaultAssetFolder: assetId ? Path.dirname(assetId) : project.defaultAssetFolder,
                defaultWorkspaceFolder: workspacePath ? Path.dirname(workspacePath) : project.defaultWorkspaceFolder
            })
        }
        onRetrieve && (terminal
            ? onRetrieve(values, {resolveImageOutput$: () => of(terminal)})
            : onRetrieve(values))
    }

    startImageOutputResolution() {
        this.stopImageOutputResolution()
        const contract = this.props.imageOutputResolution
        if (!contract) {
            if (this.state.imageOutputTerminal || this.state.imageOutputResolutionKey !== undefined) {
                this.setState({
                    destinationReconciliation: null,
                    imageOutputResolutionKey: undefined,
                    imageOutputTerminal: null
                })
            }
            return
        }

        const operation = {key: contract.key, sawTerminal: false, subscription: null}
        this.imageOutputOperation = operation
        if (!isEqual(this.state.imageOutputResolutionKey, contract.key) || this.state.imageOutputTerminal) {
            this.setState({
                destinationReconciliation: null,
                imageOutputResolutionKey: contract.key,
                imageOutputTerminal: null
            })
        }

        const publishTerminal = terminal => {
            if (this.mounted
                && this.imageOutputOperation === operation
                && ['READY', 'UNAVAILABLE', 'INVALID'].includes(terminal?.status)
            ) {
                operation.sawTerminal = true
                this.setState({imageOutputTerminal: terminal}, () => {
                    this.reconcileDestination()
                    this.settleInitialLoading(terminal)
                })
            }
        }

        try {
            const subscription = contract.state$.subscribe({
                next: publishTerminal,
                error: () => publishTerminal({
                    status: 'UNAVAILABLE',
                    description: null,
                    diagnostics: [],
                    error: null
                }),
                complete: () => {
                    if (!operation.sawTerminal) {
                        publishTerminal({
                            status: 'UNAVAILABLE',
                            description: null,
                            diagnostics: [],
                            error: null
                        })
                    }
                }
            })
            operation.subscription = subscription
            if (this.imageOutputOperation !== operation) {
                subscription.unsubscribe()
            }
        } catch (_error) {
            publishTerminal({
                status: 'UNAVAILABLE',
                description: null,
                diagnostics: [],
                error: null
            })
        }
    }

    stopImageOutputResolution() {
        const operation = this.imageOutputOperation
        this.imageOutputOperation = null
        operation?.subscription?.unsubscribe()
    }

    // The opening view stands until the resolution has answered AND it has been up long enough to read. A
    // failure is shown as soon as it arrives, and once the panel is open a later resolution never hides it
    // again.
    settleInitialLoading(terminal) {
        if (this.state.initialLoadingDone || !terminal) {
            return
        }
        if (terminal.status !== 'READY' || this.minimumLoadingElapsed) {
            this.setState({initialLoadingDone: true})
        }
    }

    isInitialLoading() {
        return Boolean(this.props.imageOutputResolution) && !this.state.initialLoadingDone
    }

    getImageOutputTerminal() {
        const {imageOutputResolution} = this.props
        const {imageOutputResolutionKey, imageOutputTerminal} = this.state
        return imageOutputResolution && isEqual(imageOutputResolution.key, imageOutputResolutionKey)
            ? imageOutputTerminal
            : null
    }

    // Where this panel owns an output resolution, that resolution is the only authority for what may be
    // selected, so the choices offered and the description validated and submitted cannot disagree. The
    // options a recipe type supplies then carry presentation alone, matched by name; they neither add a band
    // nor withhold one. A panel with no resolution keeps offering exactly what its type supplies.
    bandChoices() {
        const {bandOptions, imageOutputResolution} = this.props
        if (!imageOutputResolution) {
            return {status: DECLARED_CHOICES, choices: bandOptions}
        }
        const terminal = this.getImageOutputTerminal()
        if (!terminal) {
            return {status: LOADING_CHOICES}
        }
        if (terminal.status !== 'READY') {
            return {status: UNRESOLVED_CHOICES}
        }
        const presentation = new Map((bandOptions || []).flat().map(option => [option.value, option]))
        return {
            status: RESOLVED_CHOICES,
            choices: [terminal.description.output.bands.map(({name}) =>
                ({label: name, ...presentation.get(name), value: name})
            )]
        }
    }

    getPhysicalDestinationCompatibility() {
        const terminal = this.getImageOutputTerminal()
        if (terminal?.status !== 'READY' || !terminal.description?.output?.bands) {
            return null
        }
        const {allBands, inputs: {bands, useAllBands}} = this.props
        return physicalDestinationCompatibility({
            bands: terminal.description.output.bands,
            selectedBandNames: bands.value,
            useAllBands: allBands ? true : useAllBands.value
        })
    }

    isDestinationControlDisabled() {
        return Boolean(this.props.imageOutputResolution)
            && this.getImageOutputTerminal()?.status !== 'READY'
    }

    resolvedOutputBlocksSubmission() {
        if (!this.props.imageOutputResolution) {
            return false
        }
        const terminal = this.getImageOutputTerminal()
        const compatibility = this.getPhysicalDestinationCompatibility()
        const destination = this.props.inputs.destination.value
        return terminal?.status !== 'READY'
            || compatibility?.selectionStatus !== VALID_SELECTION
            || compatibility.destinations[destination] === false
    }

    // Read from the selection that is actually held, against the catalogue as it stands now - so restoring a
    // band restores the selection with it, and a resolution of something else cannot make a missing band
    // look present. Retrieval is already blocked by destination compatibility, which reads the same names.
    missingSelection() {
        const available = this.availableBandNames()
        return available
            ? (this.props.inputs.bands.value || []).filter(name => !available.has(name))
            : []
    }

    availableBandNames() {
        const terminal = this.getImageOutputTerminal()
        return terminal?.status === 'READY'
            ? new Set(terminal.description.output.bands.map(({name}) => name))
            : null
    }

    // The control offers only bands the catalogue holds, so a selected name it does not hold has no button to
    // clear it with. Editing the selection is the correction: the edit is kept and the unavailable names go
    // with it - after they have been named, and after they have blocked retrieval, never in silence.
    onBandsChange(selection) {
        const {inputs: {bands}} = this.props
        const available = this.availableBandNames()
        bands.set(available ? selection.filter(name => available.has(name)) : selection)
    }

    reconcileDestination() {
        const compatibility = this.getPhysicalDestinationCompatibility()
        const {destination} = this.props.inputs
        const reconciliation = this.state.destinationReconciliation
        if (!compatibility || compatibility.destinations[destination.value] !== false) {
            if (reconciliation) {
                this.setState({destinationReconciliation: null})
            }
            return
        }

        const replacement = this.props.toEE
            && isGoogleAccount()
            && compatibility.destinations.GEE
            ? 'GEE'
            : null
        if (destination.value === replacement
            || (reconciliation?.from === destination.value && reconciliation?.to === replacement)
        ) {
            return
        }
        this.setState({
            destinationReconciliation: {from: destination.value, to: replacement}
        })
        destination.set(replacement)
    }

    findProject() {
        const {projects, projectId} = this.props
        return projects.find(({id}) => id === projectId)
    }
    
    getRecipeName() {
        const {recipeTitle, recipePlaceholder} = this.props
        return recipeTitle || recipePlaceholder || 'sepal_export'
    }

    requiresDestinationValidation(props = this.props) {
        const {inputs: {destination}} = props
        return ['GEE', 'SEPAL'].includes(destination.value)
    }

    onDestinationChange(destination) {
        this.setDestinationValidationPending(['GEE', 'SEPAL'].includes(destination))
    }

    onDestinationValidityCheckChange(destinationValidationPending) {
        this.setDestinationValidationPending(destinationValidationPending)
    }

    setDestinationValidationPending(destinationValidationPending) {
        if (this.state.destinationValidationPending !== destinationValidationPending) {
            this.setState({destinationValidationPending})
        }
    }
}

export const MosaicRetrievePanel = compose(
    _MosaicRetrievePanel,
    connect(mapStateToProps),
    recipeFormPanel({id: 'retrieve', fields, constraints, mapRecipeToProps}),
    asFunctionalComponent({
        scaleTicks: [10, 15, 20, 30, 60, 100],
        defaultCrs: 'EPSG:4326',
        defaultScale: 30,
        defaultShardSize: 256,
        defaultFileDimensionsMultiple: 10,
        defaultTileSize: 2
    })
)

MosaicRetrievePanel.propTypes = {
    defaultCrs: PropTypes.string.isRequired,
    defaultFileDimensionsMultiple: PropTypes.number.isRequired,
    defaultScale: PropTypes.number.isRequired,
    defaultShardSize: PropTypes.number.isRequired,
    defaultTileSize: PropTypes.number.isRequired,
    onRetrieve: PropTypes.func.isRequired,
    allBands: PropTypes.any,
    allowTiling: PropTypes.any,
    bandOptions: PropTypes.array,
    className: PropTypes.any,
    defaultAssetType: PropTypes.any,
    scaleTicks: PropTypes.array,
    single: PropTypes.any,
    toEE: PropTypes.any,
    toSepal: PropTypes.any,
    toDrive: PropTypes.any,
    imageOutputResolution: PropTypes.shape({
        key: PropTypes.any,
        state$: PropTypes.shape({subscribe: PropTypes.func.isRequired}).isRequired
    })
}
