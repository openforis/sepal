import Path from 'path'
import PropTypes from 'prop-types'
import React from 'react'

import {
    isUnresolved,
    MISSING_SELECTION,
    physicalRequest,
    reconciledChoices,
    RESOLVING,
    RETRIEVABLE,
    retrieveDecision,
    submitRetrieve
} from '~/app/home/body/process/recipe/retrieveOutput'
import {withRetrieveOutput} from '~/app/home/body/process/recipe/withRetrieveOutput'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {updateProject} from '~/app/home/body/process/recipeList/projects'
import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {connect} from '~/connect'
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
    format: new Form.Field(),
    crs: new Form.Field()
        .notBlank(),
    crsTransform: new Form.Field()
}

const REQUEST_CHOICES = 'REQUEST_CHOICES'
const LOADING_CHOICES = 'LOADING_CHOICES'
const UNRESOLVED_CHOICES = 'UNRESOLVED_CHOICES'
const RESOLVED_CHOICES = 'RESOLVED_CHOICES'

// A resolution that answers almost at once would otherwise replace the opening view before it could be read.
const MINIMUM_LOADING_MS = 500

// A selection of the physical bands the output holds, offered and named as they are.
const physicalSelection = {
    request: physicalRequest,
    choices: output => output.bands.map(({name}) => name),
    unavailable: missingBandNames => missingBandNames
}

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
            initialLoadingDone: !this.isResolving()
        }
        this.minimumLoadingElapsed = false
        this.initialLoadingTimer = null
        this.mounted = false
        this.onDestinationChange = this.onDestinationChange.bind(this)
        this.onDestinationValidityCheckChange = this.onDestinationValidityCheckChange.bind(this)
    }

    render() {
        const {className, form} = this.props
        const {more, destinationValidationPending, destinationReconciliation} = this.state
        const invalid = this.isInitialLoading()
            || destinationValidationPending
            || Boolean(destinationReconciliation)
            || this.blocksSubmission()
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
        const {allBands, allowTiling, toSepal, toEE, sitsFormat, inputs: {destination, assetType}} = this.props
        const {more} = this.state
        if (this.isInitialLoading()) {
            return this.renderLoading()
        }
        return (
            <Layout>
                {allBands ? null : this.renderBandOptions()}
                {this.renderScale()}
                {toEE && toSepal && this.renderDestination()}
                {sitsFormat ? this.renderFormat() : null}
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
        const destinations = this.destinations()
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
                ...(destinations && destinations[option.value] === false
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

    renderFormat() {
        const {inputs: {format}} = this.props
        const formatOptions = [
            {
                value: 'CLASSIC',
                label: msg('process.retrieve.form.format.CLASSIC.label'),
                tooltip: msg('process.retrieve.form.format.CLASSIC.tooltip')
            },
            {
                value: 'SITS',
                label: msg('process.retrieve.form.format.SITS.label'),
                tooltip: msg('process.retrieve.form.format.SITS.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.retrieve.form.format.label')}
                input={format}
                multiple={false}
                options={formatOptions}/>
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
        return status === REQUEST_CHOICES
            ? this.renderRequestOptions(options)
            : this.renderResolvedBandOptions(options)
    }

    // A request that is not about the recipe's output: what the recipe type supplies is the whole truth here, so
    // the control is free to drop a selected name its options no longer carry.
    renderRequestOptions(options) {
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

    // The control is given the selection rather than the form field: the selection is reconciled with the output
    // here (reconcileBands), and a control dropping names by its own options would be a second authority. What is
    // still named as unavailable is what no saved choice can remove - a CCDC breakpoint band, for one.
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
                    onChange={selected => bands.set(selected)}
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
        const {allBands, sitsFormat, defaultAssetType, defaultCrs, defaultScale, defaultShardSize, defaultFileDimensionsMultiple, defaultTileSize,
            inputs: {assetType, sharing, crs, crsTransform, scale, shardSize, fileDimensionsMultiple, tileSize, useAllBands, filenamePrefix, format}
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
        if (sitsFormat && !format.value) {
            format.set('CLASSIC')
        }
        if (allBands) {
            useAllBands.set(true)
        }
        if (!filenamePrefix.value) {
            const recipeName = this.getRecipeName()
            filenamePrefix.set(recipeName)
        }
        if (!this.state.initialLoadingDone) {
            this.startMinimumLoading()
        }
        this.update()
        this.reconcileBands()
        this.reconcileDestination()
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs.destination.value !== this.props.inputs.destination.value) {
            this.setDestinationValidationPending(this.requiresDestinationValidation())
        }
        this.update()
        this.settleInitialLoading()
        this.reconcileBands()
        this.reconcileDestination()
    }

    componentWillUnmount() {
        this.mounted = false
        clearTimeout(this.initialLoadingTimer)
        this.initialLoadingTimer = null
    }

    startMinimumLoading() {
        this.initialLoadingTimer = setTimeout(() => {
            this.initialLoadingTimer = null
            this.minimumLoadingElapsed = true
            if (this.mounted) {
                this.settleInitialLoading()
            }
        }, MINIMUM_LOADING_MS)
    }

    update() {
        const {toEE, toSepal, inputs: {destination, assetType}} = this.props
        const destinations = this.destinations()
        if (!destination.value) {
            if (toEE && isGoogleAccount() && destinations?.GEE !== false) {
                this.setDestinationValidationPending(true)
                destination.set('GEE')
            } else if (toSepal && destinations?.SEPAL !== false) {
                this.setDestinationValidationPending(true)
                destination.set('SEPAL')
            }
        } else {
            if (destination.value === 'GEE' && !assetType.value) {
                assetType.set('Image')
            }
        }
    }

    // A request about the recipe's output is decided again, from the session as it stands at this moment, by the
    // submission itself - never from what this panel last rendered. The project remembers the destination only
    // once the retrieval was accepted.
    retrieve(values) {
        const {requestOptions, onRetrieve, readRetrieveOutput, selection = physicalSelection, task, submitTask} = this.props
        if (requestOptions) {
            this.rememberDestination(values)
            return onRetrieve(values)
        }
        const read = readRetrieveOutput()
        if (!read) {
            return
        }
        const {recipe, output, pending} = read
        const request = selection.request({recipe, output, retrieveOptions: this.withAllBands(values)})
        if (submitRetrieve({recipe, output, pending, request, task, submitTask})) {
            this.rememberDestination(values)
        }
    }

    rememberDestination({assetId, workspacePath}) {
        const project = this.findProject()
        if (project) {
            updateProject({
                ...project,
                defaultAssetFolder: assetId ? Path.dirname(assetId) : project.defaultAssetFolder,
                defaultWorkspaceFolder: workspacePath ? Path.dirname(workspacePath) : project.defaultWorkspaceFolder
            })
        }
    }

    // The opening view stands until the read has answered AND it has been up long enough to read. A failure is
    // shown as soon as it arrives, and once the panel is open a later read never hides it again. A read that
    // answers on the first render never shows it at all.
    settleInitialLoading() {
        if (this.state.initialLoadingDone || this.isResolving()) {
            return
        }
        if (this.isUnresolved() || this.minimumLoadingElapsed) {
            this.setState({initialLoadingDone: true})
        }
    }

    isInitialLoading() {
        return !this.state.initialLoadingDone
    }

    // What may be retrieved as the form stands, decided by the one rule the submission decides by. None for a
    // request that is not about the recipe's output.
    decision() {
        const {requestOptions, retrieveOutput, task} = this.props
        if (requestOptions || !retrieveOutput) {
            return null
        }
        const {output, pending} = retrieveOutput
        const {names, retrieveOptions: {destination}} = this.request()
        return retrieveDecision({output, pending, names, destination, task})
    }

    request() {
        const {retrieveOutput: {recipe, output}, selection = physicalSelection} = this.props
        return selection.request({recipe, output, retrieveOptions: this.formOptions()})
    }

    formOptions() {
        const {inputs: {bands, useAllBands, destination}} = this.props
        return this.withAllBands({bands: bands.value, useAllBands: useAllBands.value, destination: destination.value})
    }

    // A panel retrieving all bands says so whatever its form holds.
    withAllBands(retrieveOptions) {
        return this.props.allBands ? {...retrieveOptions, useAllBands: true} : retrieveOptions
    }

    isResolving() {
        return this.decision()?.status === RESOLVING
    }

    isUnresolved() {
        const decision = this.decision()
        return Boolean(decision) && isUnresolved(decision)
    }

    // What the output lets the user choose from, grouped as the recipe type presents it. A choice the presentation
    // does not know is still offered, after the groups it does know: presentation decorates the output and never
    // withholds any of it.
    bandChoices() {
        const {bandOptions, requestOptions, retrieveOutput, selection = physicalSelection} = this.props
        if (requestOptions) {
            return {status: REQUEST_CHOICES, choices: requestOptions}
        }
        if (this.isResolving()) {
            return {status: LOADING_CHOICES}
        }
        if (this.isUnresolved()) {
            return {status: UNRESOLVED_CHOICES}
        }
        return {
            status: RESOLVED_CHOICES,
            choices: presentedChoices(selection.choices(retrieveOutput.output), bandOptions)
        }
    }

    destinations() {
        return this.decision()?.destinations || null
    }

    isDestinationControlDisabled() {
        return this.isResolving() || this.isUnresolved()
    }

    blocksSubmission() {
        const decision = this.decision()
        return Boolean(decision) && decision.status !== RETRIEVABLE
    }

    // Named in the terms of the selection, against the output as it stands now. Retrieval is blocked by the same
    // decision, which reads the same names.
    missingSelection() {
        const decision = this.decision()
        const {selection = physicalSelection} = this.props
        return decision?.reason === MISSING_SELECTION
            ? selection.unavailable(decision.missingBandNames, this.formOptions())
            : []
    }

    // Once the output has answered, a saved choice it no longer offers goes from the selection, and the rest stay.
    reconcileBands() {
        const decision = this.decision()
        if (!decision) {
            return
        }
        const {inputs: {bands}, retrieveOutput, selection = physicalSelection} = this.props
        const kept = reconciledChoices({decision, saved: bands.value, offered: selection.choices(retrieveOutput.output)})
        if (kept) {
            bands.set(kept)
        }
    }

    reconcileDestination() {
        const destinations = this.destinations()
        const {destination} = this.props.inputs
        const reconciliation = this.state.destinationReconciliation
        if (!destinations || destinations[destination.value] !== false) {
            if (reconciliation) {
                this.setState({destinationReconciliation: null})
            }
            return
        }

        const replacement = this.props.toEE
            && isGoogleAccount()
            && destinations.GEE
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
    withRetrieveOutput({isImageOutput: ({requestOptions}) => !requestOptions}),
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

// A panel retrieves the recipe's image output unless it is given `requestOptions`: a request about something else,
// whose options are the whole truth and which `onRetrieve` submits. Otherwise `bandOptions` only presents what the
// output holds, `selection` translates what is chosen into the bands it exports (physical names by default),
// `task` configures the generic image export, and `submitTask` replaces it where the recipe has its own.
MosaicRetrievePanel.propTypes = {
    defaultCrs: PropTypes.string.isRequired,
    defaultFileDimensionsMultiple: PropTypes.number.isRequired,
    defaultScale: PropTypes.number.isRequired,
    defaultShardSize: PropTypes.number.isRequired,
    defaultTileSize: PropTypes.number.isRequired,
    allBands: PropTypes.any,
    allowTiling: PropTypes.any,
    bandOptions: PropTypes.array,
    className: PropTypes.any,
    defaultAssetType: PropTypes.any,
    requestOptions: PropTypes.array,
    scaleTicks: PropTypes.array,
    selection: PropTypes.shape({
        request: PropTypes.func.isRequired,
        choices: PropTypes.func.isRequired,
        unavailable: PropTypes.func.isRequired
    }),
    single: PropTypes.any,
    sitsFormat: PropTypes.any,
    submitTask: PropTypes.func,
    task: PropTypes.object,
    toDrive: PropTypes.any,
    toEE: PropTypes.any,
    toSepal: PropTypes.any,
    onRetrieve: PropTypes.func
}

const presentedChoices = (values, presentationGroups = []) => {
    const offered = new Set(values)
    const presented = new Set()
    const groups = presentationGroups.map(group => group
        .filter(option => offered.has(option.value) && !presented.has(option.value))
        .map(option => (presented.add(option.value), option))
    )
    const unpresented = values
        .filter(value => !presented.has(value))
        .map(value => ({value, label: value}))
    return [...groups, unpresented].filter(group => group.length)
}
