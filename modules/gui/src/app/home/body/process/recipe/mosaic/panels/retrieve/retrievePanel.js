import {Buttons} from 'widget/buttons'
import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {connect} from 'store'
import {currentUser} from 'user'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './retrievePanel.module.css'

const fields = {
    bands: new Form.Field()
        .predicate(bands => bands && bands.length, 'process.retrieve.form.bands.atLeastOne'),
    scale: new Form.Field()
        .notBlank()
        .number(),
    destination: new Form.Field()
        .notEmpty('process.retrieve.form.destination.required'),
    downloadPath: new Form.Field()
        .skip((v, {destination}) => destination !== 'SEPAL')
        .notBlank(),
    assetId: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .notBlank(),
}

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

class _MosaicRetrievePanel extends React.Component {
    render() {
        const {onRetrieve} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={values => onRetrieve && onRetrieve(values)}>
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
        const {toSepal, toEE, inputs: {destination}} = this.props
        return (
            <Layout>
                {this.renderBandOptions()}
                {this.renderScale()}
                {toEE && toSepal && this.renderDestination()}
                {destination.value === 'SEPAL' ? this.renderDownloadPath() : null}
                {destination.value === 'GEE' ? this.renderAssetId() : null}
            </Layout>
        )
    }

    renderDestination() {
        const {toSepal, toEE, user, inputs: {destination}} = this.props
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
            .filter(({value}) => user.googleTokens || value !== 'GEE')
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

    renderDownloadPath() {
        const {inputs: {downloadPath}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.downloadPath.label')}
                placeholder={msg('process.retrieve.form.downloadPath.tooltip')}
                tooltip={msg('process.retrieve.form.downloadPath.tooltip')}
                input={downloadPath}
            />
        )
    }

    renderAssetId() {
        const {assetRoots, inputs: {assetId}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.assetId.label')}
                placeholder={msg('process.retrieve.form.assetId.tooltip')}
                tooltip={msg('process.retrieve.form.assetIt.tooltip')}
                input={assetId}
                busyMessage={!assetRoots}
                disabled={!assetRoots}
            />
        )
    }

    renderBandOptions() {
        const {bandOptions, single, inputs: {bands}} = this.props
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

    renderScale() {
        const {inputs: {scale}} = this.props
        return (
            <Widget
                layout='horizontal'
                spacing='compact'
                label={msg('process.retrieve.form.scale.label')}>
                <Buttons
                    options={[1, 5, 10, 15, 20, 30, 60, 100]}
                    spacing='none'
                    selected={Number(scale.value)}
                    onChange={value => scale.set(value)}
                />
                <Form.Input
                    input={scale}
                    type='number'
                    suffix='meters'
                    placeholder={msg('process.retrieve.form.customScale.label')}
                />
            </Widget>
        )
    }
    
    componentDidMount() {
        const {defaultScale, inputs: {scale}} = this.props
        if (!scale.value) {
            scale.set(defaultScale)
        }
        this.update()
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {assetRoots, toEE, toSepal, user, inputs: {destination, downloadPath, assetId}} = this.props
        if (toSepal && !destination.value) {
            destination.set('SEPAL')
        } else if (user.googleTokens && toEE && !destination.value) {
            destination.set('GEE')
        }
        if (!downloadPath.value && destination.value === 'SEPAL') {
            downloadPath.set(`downloads/${this.defaultPath()}`)
        } else if (assetRoots && assetRoots.length && !assetId.value && destination.value === 'GEE') {
            assetId.set(`${assetRoots[0]}/${this.defaultPath()}`)
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
}

export const MosaicRetrievePanel = compose(
    _MosaicRetrievePanel,
    connect(mapStateToProps),
    recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})
)

MosaicRetrievePanel.defaultProps = {
    ticks: [10, 15, 20, 30, 60, 100]
}
MosaicRetrievePanel.propTypes = {
    bandOptions: PropTypes.array.isRequired,
    defaultScale: PropTypes.number.isRequired,
    onRetrieve: PropTypes.func.isRequired,
    single: PropTypes.any,
    ticks: PropTypes.array,
    toEE: PropTypes.any,
    toSepal: PropTypes.any
}
