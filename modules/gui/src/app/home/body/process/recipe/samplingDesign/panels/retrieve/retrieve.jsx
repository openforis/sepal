import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {isGoogleAccount} from '~/user'
import {AssetDestination} from '~/widget/assetDestination'
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
}

const mapRecipeToProps = recipe =>
    ({
        recipeId: recipe.id,
    })

class _Retrieve extends React.Component {

    constructor(props) {
        super(props)
        this.retrieve = this.retrieve.bind(this)
    }

    render() {
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
                    applyLabel={msg('process.retrieve.apply')}/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {destination}} = this.props
        return (
            <Layout>
                {this.renderDestination()}
                {destination.value === 'SEPAL' ? this.renderWorkspaceDestination() : null}
                {destination.value === 'GEE' ? this.renderAssetDestination() : null}
                {destination.value === 'SEPAL' ? this.renderFileFormat() : null}
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
                placeholder={msg('process.retrieve.form.assetId.placeholder')}
                tooltip={msg('process.retrieve.form.assetId.tooltip')}
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

    componentDidMount() {
        const {inputs: {fileFormat, sharing}} = this.props
        if (!fileFormat.value) {
            fileFormat.set('CSV')
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
