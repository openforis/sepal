import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {isGoogleAccount} from '~/user'
import {AssetDestination} from '~/widget/assetDestination'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {WorkspaceDestination} from '~/widget/workspaceDestination'

import {RecipeFormPanel, recipeFormPanel} from '../../../../recipeFormPanel'
import {RecipeActions} from '../../samplingDesignRecipe'
import styles from './retrieve.module.css'

const fields = {
    destination: new Form.Field()
        .notEmpty('process.retrieve.form.destination.required'),
    workspacePath: new Form.Field()
        .skip((v, {destination}) => destination !== 'SEPAL')
        .notBlank(),
    assetId: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .notBlank(),
    fileFormat: new Form.Field()
        .skip((v, {destination}) => destination !== 'SEPAL')
        .notBlank(),
    sharing: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .notBlank(),
    strategy: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .notBlank(),
    crs: new Form.Field()
        .notBlank(),
    crsTransform: new Form.Field()
}

const mapRecipeToProps = recipe =>
    ({
        recipeId: recipe.id,
    })

class _Retrieve extends React.Component {
    state = {more: false}

    constructor(props) {
        super(props)
        this.retrieve = this.retrieve.bind(this)
    }

    render() {
        const {more} = this.state
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={values => {
                    return this.retrieve(values)
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
        const {inputs: {destination}} = this.props
        const {more} = this.state
        return (
            <Layout>
                {this.renderDestination()}
                {destination.value === 'SEPAL' ? this.renderWorkspaceDestination() : null}
                {destination.value === 'GEE' ? this.renderAssetDestination() : null}
                {destination.value === 'SEPAL' ? this.renderFileFormat() : null}

                <Layout type='horizontal'>
                    {more ? this.renderCrs() : null}
                    {more ? this.renderCrsTransform() : null}
                </Layout>
            </Layout>
        )
    }

    renderDestination() {
        const {inputs: {destination}} = this.props
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
        const {inputs: {assetId, strategy}} = this.props
        return (
            <AssetDestination
                type={'Table'}
                label={msg('process.retrieve.form.assetId.label')}
                placeholder={msg('process.retrieve.form.assetId.tooltip')}
                tooltip={msg('process.retrieve.form.assetIt.tooltip')}
                assetInput={assetId}
                strategyInput={strategy}
            />
        )
    }

    renderFileFormat() {
        const {inputs: {fileFormat}} = this.props
        const options = [
            {
                value: 'CSV',
                label: msg('process.samplingDesign.panel.retrieve.form.fileFormat.CSV')
            },
            {
                value: 'GeoJSON',
                label: msg('process.samplingDesign.panel.retrieve.form.fileFormat.GeoJSON')
            },
            {
                value: 'KML',
                label: msg('process.samplingDesign.panel.retrieve.form.fileFormat.KML')
            },
            {
                value: 'KMZ',
                label: msg('process.samplingDesign.panel.retrieve.form.fileFormat.KMZ')
            },
            {
                value: 'SHP',
                label: msg('process.samplingDesign.panel.retrieve.form.fileFormat.SHP')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.samplingDesign.panel.retrieve.form.fileFormat.label')}
                input={fileFormat}
                multiple={false}
                options={options}/>
        )
    }

    renderCrs() {
        const {inputs: {crs}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.crs.label')}
                placeholder={msg('process.retrieve.form.crs.placeholder')}
                tooltip={msg('process.samplingDesign.panel.retrieve.form.crs.tooltip')}
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
                tooltip={msg('process.samplingDesign.panel.retrieve.form.crsTransform.tooltip')}
                input={crsTransform}
            />
        )
    }

    componentDidMount() {
        const {inputs: {fileFormat, sharing, crs, crsTransform}
        } = this.props
        const defaultCrs = 'EPSG:4326'
        const more = (crs.value && crs.value !== defaultCrs)
            || (crsTransform.value)
        this.setState({more})
        if (!fileFormat.value) {
            fileFormat.set('CSV')
        }
        if (!crs.value) {
            crs.set(defaultCrs)
        }
        if (!sharing.value) {
            sharing.set('PRIVATE')
        }
        this.update()
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {inputs: {destination}} = this.props
        if (isGoogleAccount() && !destination.value) {
            destination.set('GEE')
        } else if (!destination.value) {
            destination.set('SEPAL')
        }
    }
        
    retrieve(retrieveOptions) {
        const {recipeId} = this.props
        // TODO: updateProject(), just like in RetrievePanel?
        return RecipeActions(recipeId).retrieve(retrieveOptions)
    }
}

export const Retrieve = compose(
    _Retrieve,
    recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})
)

Retrieve.propTypes = {
    recipeId: PropTypes.string
}
