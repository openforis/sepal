import Path from 'path'
import React from 'react'

import {
    isUnresolved,
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

import {retrieveTask} from '../../ccdcSliceRecipe'
import {retrievableBands, sliceRequest} from '../../sliceEvidence'
import styles from './retrieve.module.css'

const fields = {
    baseBands: new Form.Field(),
    bandTypes: new Form.Field(),
    segmentBands: new Form.Field(),
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
    crs: new Form.Field()
        .notBlank(),
    crsTransform: new Form.Field()
}

const constraints = {
    fileDimensionsMultipleSize: new Form.Constraint(['fileDimensionsMultiple', 'shardSize'])
        .skip(({destination}) => destination !== 'SEPAL')
        .predicate(({fileDimensionsMultiple, shardSize}) =>
            fileDimensionsMultiple * shardSize <= 131072, 'process.retrieve.form.fileDimensionsMultiple.tooLarge'
        ),
    bandSelected: new Form.Constraint(['baseBands', 'bandTypes', 'segmentBands'])
        .predicate(({baseBands, bandTypes, segmentBands}) =>
            (baseBands?.length && bandTypes?.length) || segmentBands?.length, 'process.ccdcSlice.panel.retrieve.form.baseBands.atLeastOne'
        )
}

const mapStateToProps = state => ({
    projects: selectFrom(state, 'process.projects')
})

const mapRecipeToProps = recipe => ({
    projectId: recipe.projectId
})

class _Retrieve extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            more: false,
            destinationValidationPending: this.requiresDestinationValidation(props)
        }
        const {inputs: {scale}} = this.props
        if (!scale.value)
            scale.set(30)
        this.onDestinationChange = this.onDestinationChange.bind(this)
        this.onDestinationValidityCheckChange = this.onDestinationValidityCheckChange.bind(this)
    }

    render() {
        const {form} = this.props
        const {more, destinationValidationPending} = this.state
        const invalid = destinationValidationPending || this.decision().status !== RETRIEVABLE || form.isInvalid()
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='top-right'
                isActionForm
                onApply={values => {
                    const {fileDimensionsMultiple, shardSize} = values
                    return this.retrieve({...values, fileDimensions: fileDimensionsMultiple * shardSize})
                }}>
                <Panel.Header
                    icon='cloud-download-alt'
                    title={msg('process.ccdcSlice.panel.retrieve.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons
                    applyLabel={msg('process.ccdcSlice.panel.retrieve.apply')}
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
        const {inputs: {destination, assetType}} = this.props
        const {more} = this.state
        return (
            <Layout>
                {this.renderSelection()}
                {this.renderScale()}
                {this.renderDestination()}
                {destination.value === 'SEPAL' ? this.renderWorkspaceDestination() : null}
                {destination.value === 'GEE' ? this.renderAssetType() : null}
                {destination.value === 'GEE' ? this.renderAssetDestination() : null}
                {destination.value === 'GEE' ? this.renderSharing() : null}
                {more && destination.value === 'GEE' && assetType.value === 'ImageCollection' ? this.renderTileSize() : null}
                {more && destination.value === 'GEE' ? this.renderShardSize() : null}
                {more && destination.value === 'SEPAL' ? this.renderFileDimensionsMultiple() : null}
                <Layout type='horizontal'>
                    {more ? this.renderCrs() : null}
                    {more ? this.renderCrsTransform() : null}
                </Layout>
            </Layout>
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
        const {inputs: {destination}} = this.props
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
        return (
            <Form.Buttons
                label={msg('process.retrieve.form.destination.label')}
                input={destination}
                multiple={false}
                options={destinationOptions}
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

    // Offered only once the output is known, and only what it holds. The controls are given the selection rather
    // than the form field, which is reconciled with the output once it has answered. A combination of offered
    // choices the output does not produce is still named, and blocks.
    renderSelection() {
        const decision = this.decision()
        if (decision.status === RESOLVING) {
            return this.renderLoading()
        }
        if (isUnresolved(decision)) {
            return this.renderUnresolved()
        }
        const structure = retrievableBands(this.outputBandNames())
        const unavailable = decision.missingBandNames
        return (
            <Layout spacing='compact'>
                {this.renderBaseBands(structure)}
                {this.renderBandTypes(structure)}
                {this.renderSegmentBands(structure)}
                {unavailable.length
                    ? (
                        <Message
                            type='warning'
                            icon='triangle-exclamation'
                            text={msg('process.retrieve.form.bands.unavailable', {bands: unavailable.join(', ')})}
                        />
                    )
                    : null}
            </Layout>
        )
    }

    renderLoading() {
        return (
            <NoData
                alignment='left'
                message={<div><Icon name='spinner'/>{' ' + msg('process.retrieve.form.bands.loading')}</div>}
            />
        )
    }

    renderUnresolved() {
        return (
            <Widget label={msg('process.ccdcSlice.panel.retrieve.form.baseBands.label')} framed>
                <Message type='info' icon='triangle-exclamation' text={msg('process.retrieve.error.imageOutput')}/>
            </Widget>
        )
    }

    renderBaseBands({baseBands}) {
        const bandOptions = baseBands.map(({name}) => ({value: name, label: name}))
        return this.renderChoice('baseBands', {
            label: msg('process.ccdcSlice.panel.retrieve.form.baseBands.label'),
            options: bandOptions
        })
    }

    renderBandTypes({measures}) {
        const bandTypeOptions = [
            {
                value: 'value',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.value.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.value.tooltip')
            },
            {
                value: 'rmse',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.rmse.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.rmse.tooltip')
            },
            {
                value: 'magnitude',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.magnitude.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.magnitude.tooltip')
            },
            {
                value: 'breakConfidence',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.breakConfidence.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.breakConfidence.tooltip')
            },
            {
                value: 'intercept',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.intercept.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.intercept.tooltip')
            },
            {
                value: 'slope',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.slope.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.slope.tooltip')
            },
            {
                value: 'phase_1',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase1.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase1.tooltip')
            },
            {
                value: 'phase_2',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase2.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase2.tooltip')
            },
            {
                value: 'phase_3',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase3.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase3.tooltip')
            },
            {
                value: 'amplitude_1',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude1.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude1.tooltip')
            },
            {
                value: 'amplitude_2',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude2.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude2.tooltip')
            },
            {
                value: 'amplitude_3',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude3.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude3.tooltip')
            }
        ].filter(({value}) => measures.includes(value))
        return this.renderChoice('bandTypes', {
            label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.label'),
            options: bandTypeOptions
        })
    }

    renderSegmentBands({segmentBands}) {
        const bands = segmentBands.map(({name}) => name)
        const options = [
            {
                value: 'tStart',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tStart.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tStart.tooltip')
            },
            {
                value: 'tEnd',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tEnd.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tEnd.tooltip')
            },
            {
                value: 'tBreak',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tBreak.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tBreak.tooltip')
            },
            {
                value: 'numObs',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.numObs.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.numObs.tooltip')
            },
            {
                value: 'changeProb',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.changeProb.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.changeProb.tooltip')
            }
        ].filter(({value}) => bands.includes(value))
        return options.length
            ? this.renderChoice('segmentBands', {
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tooltip'),
                options
            })
            : null
    }

    renderChoice(field, {label, tooltip, options}) {
        const input = this.props.inputs[field]
        return (
            <Buttons
                label={label}
                tooltip={tooltip}
                selected={input.value}
                multiple
                options={options}
                onChange={selected => input.set(selected)}
                framed/>
        )
    }

    renderScale() {
        const {inputs: {scale}} = this.props
        return (
            <NumberButtons
                label={msg('process.retrieve.form.scale.label')}
                placeholder={msg('process.retrieve.form.scale.placeholder')}
                input={scale}
                options={[1, 5, 10, 15, 20, 30, 60, 100]}
                suffix={msg('process.retrieve.form.scale.suffix')}
            />
        )
    }

    renderWorkspacePath() {
        const {inputs: {workspacePath}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.workspacePath.label')}
                placeholder={msg('process.retrieve.form.workspacePath.tooltip')}
                tooltip={msg('process.retrieve.form.workspacePath.tooltip')}
                input={workspacePath}
            />
        )
    }

    renderAssetId() {
        const {assetRoots, inputs: {assetId}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.assetId.label')}
                placeholder={msg('process.retrieve.form.assetId.placeholder')}
                tooltip={msg('process.retrieve.form.assetId.tooltip')}
                input={assetId}
                busyMessage={!assetRoots}
                disabled={!assetRoots}
            />
        )
    }
    componentDidMount() {
        const {defaultAssetType, defaultCrs, defaultScale, defaultShardSize, defaultFileDimensionsMultiple, defaultTileSize,
            inputs: {assetType, sharing, crs, crsTransform, scale, shardSize, fileDimensionsMultiple, tileSize}} = this.props
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
        this.update()
        this.reconcileSelection()
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs.destination.value !== this.props.inputs.destination.value) {
            this.setDestinationValidationPending(this.requiresDestinationValidation())
        }
        this.update()
        this.reconcileSelection()
    }

    update() {
        const {inputs: {destination, assetType}} = this.props
        if (!destination.value) {
            this.setDestinationValidationPending(true)
            destination.set(isGoogleAccount() ? 'GEE' : 'SEPAL')
        }
        if (!assetType.value && destination.value === 'GEE') {
            assetType.set('Image')
        }
    }

    // Decided again by the submission, from the session as it stands now: a panel can be open while the source
    // changes under it, and what it submits must be bands this recipe still produces.
    retrieve(values) {
        const read = this.props.readRetrieveOutput()
        if (!read) {
            return
        }
        const {recipe, output, pending, sourceFacts} = read
        const request = sliceRequest({output, retrieveOptions: values})
        if (submitRetrieve({recipe, output, pending, sourceFacts, request, task: retrieveTask})) {
            const {assetId, workspacePath} = values
            const project = this.findProject()
            if (project) {
                updateProject({
                    ...project,
                    defaultAssetFolder: assetId ? Path.dirname(assetId) : project.defaultAssetFolder,
                    defaultWorkspaceFolder: workspacePath ? Path.dirname(workspacePath) : project.defaultWorkspaceFolder
                })
            }
        }
    }

    decision() {
        const {retrieveOutput: {output, pending, sourceFacts}, inputs} = this.props
        const {names, unrecognized} = sliceRequest({output, retrieveOptions: {
            baseBands: inputs.baseBands.value || [],
            bandTypes: inputs.bandTypes.value || [],
            segmentBands: inputs.segmentBands.value || []
        }})
        return retrieveDecision({
            output, pending, sourceFacts, names, unrecognized, destination: inputs.destination.value, task: retrieveTask
        })
    }

    // Once the output has answered, a saved base band, measure or segment band it no longer offers goes from the
    // selection, and the rest stay.
    reconcileSelection() {
        const decision = this.decision()
        const {baseBands, measures, segmentBands} = retrievableBands(this.outputBandNames())
        const offered = {
            baseBands: baseBands.map(({name}) => name),
            bandTypes: measures,
            segmentBands: segmentBands.map(({name}) => name)
        }
        Object.entries(offered).forEach(([field, choices]) => {
            const input = this.props.inputs[field]
            const kept = reconciledChoices({decision, saved: input.value, offered: choices})
            if (kept) {
                input.set(kept)
            }
        })
    }

    outputBandNames() {
        return this.props.retrieveOutput.output.bands.map(({name}) => name)
    }

    findProject() {
        const {projects, projectId} = this.props
        return projects.find(({id}) => id === projectId)
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

export const Retrieve = compose(
    _Retrieve,
    connect(mapStateToProps),
    withRetrieveOutput(),
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
