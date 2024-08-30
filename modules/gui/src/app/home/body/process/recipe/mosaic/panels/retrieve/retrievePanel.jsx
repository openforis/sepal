import Path from 'path'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {updateProject} from '~/app/home/body/process/recipeList/projects'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {isGoogleAccount} from '~/user'
import {AssetDestination} from '~/widget/assetDestination'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {NumberButtons} from '~/widget/numberButtons'
import {Panel} from '~/widget/panel/panel'
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
    crs: new Form.Field()
        .notBlank(),
    crsTransform: new Form.Field()
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
    projectId: recipe.projectId
})

class _MosaicRetrievePanel extends React.Component {
    state = {more: false}

    render() {
        const {className} = this.props
        const {more} = this.state
        return (
            <RecipeFormPanel
                className={[styles.panel, className].join(' ')}
                isActionForm
                placement='top-right'
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
                    applyLabel={msg('process.retrieve.apply')}>
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
        return (
            <Layout>
                {allBands ? null : this.renderBandOptions()}
                {this.renderScale()}
                {toEE && toSepal && this.renderDestination()}
                {destination.value === 'SEPAL' ? this.renderWorkspaceDestination() : null}
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
        const {toSepal, toEE, inputs: {destination}} = this.props
        const destinationOptions = [
            {
                value: 'SEPAL',
                label: msg('process.retrieve.form.destination.SEPAL')
            },
            {
                value: 'GEE',
                label: msg('process.retrieve.form.destination.GEE')
            }
        ]
            .filter(({value}) => isGoogleAccount() || value !== 'GEE')
            .filter(({value}) => toSepal || value !== 'SEPAL')
            .filter(({value}) => toEE || value !== 'GEE')
        return (
            <Form.Buttons
                label={msg('process.retrieve.form.destination.label')}
                input={destination}
                multiple={false}
                options={destinationOptions}/>
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
            />
        )
    }

    renderAssetDestination() {
        const {inputs: {assetId, assetType, strategy}} = this.props
        return (
            <AssetDestination
                type={assetType.value}
                label={msg('process.retrieve.form.assetId.label')}
                placeholder={msg('process.retrieve.form.assetId.tooltip')}
                tooltip={msg('process.retrieve.form.assetIt.tooltip')}
                assetInput={assetId}
                strategyInput={strategy}
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
        const {bandOptions, single, inputs: {bands}} = this.props
        if (bandOptions.length <= 1) {
            return null
        } else {
            const options = bandOptions
                .filter(group => group.length)
                .map(group => ({options: group}))
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
        const {allBands, defaultAssetType, defaultCrs, defaultScale, defaultShardSize, defaultFileDimensionsMultiple, defaultTileSize,
            inputs: {assetType, sharing, crs, crsTransform, scale, shardSize, fileDimensionsMultiple, tileSize, useAllBands}
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
        this.update()
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {toEE, toSepal, inputs: {destination, assetType}} = this.props
        if (toSepal && !destination.value) {
            destination.set('SEPAL')
        } else if (isGoogleAccount() && toEE && !destination.value) {
            destination.set('GEE')
        }
        if (!assetType.value && destination.value === 'GEE') {
            assetType.set('Image')
        }
    }

    retrieve(values) {
        const {onRetrieve} = this.props
        const project = this.findProject()
        if (project) {
            const {assetId, workspacePath} = values
            updateProject({
                ...project,
                defaultAssetFolder: assetId ? Path.dirname(assetId) : project.defaultAssetFolder,
                defaultWorkspaceFolder: workspacePath ? Path.dirname(workspacePath) : project.defaultWorkspaceFolder
            })
        }
        onRetrieve && onRetrieve(values)
    }

    findProject() {
        const {projects, projectId} = this.props
        return projects.find(({id}) => id === projectId)
    }
}

export const MosaicRetrievePanel = compose(
    _MosaicRetrievePanel,
    connect(mapStateToProps),
    recipeFormPanel({id: 'retrieve', fields, constraints, mapRecipeToProps})
)

MosaicRetrievePanel.defaultProps = {
    scaleTicks: [10, 15, 20, 30, 60, 100],
    defaultCrs: 'EPSG:4326',
    defaultScale: 30,
    defaultShardSize: 256,
    defaultFileDimensionsMultiple: 10,
    defaultTileSize: 2
}

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
    toSepal: PropTypes.any
}
