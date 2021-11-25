import {Buttons} from 'widget/buttons'
import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {currentUser} from 'user'
import {msg} from 'translate'
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
        .notEmpty('process.retrieve.form.destination.required')
}

const mapRecipeToProps = () => ({
    user: currentUser()
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
        const {toSepal, toEE} = this.props
        return (
            <Layout>
                {this.renderBandOptions()}
                {this.renderScale()}
                {toEE && toSepal && this.renderDestination()}
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

    renderBandOptions() {
        const {bandOptions, single, inputs: {bands}} = this.props
        return (
            <Form.Buttons
                label={msg('process.retrieve.form.bands.label')}
                input={bands}
                multiple={!single}
                options={bandOptions}
                framed
            />
        )
    }

    renderScale() {
        const {inputs: {scale}} = this.props
        return (
            <Layout type='horizontal-nowrap'>
                <Buttons
                    label={msg('process.retrieve.form.scalePresets.label')}
                    options={[1, 5, 10, 15, 20, 30, 60, 100]}
                    spacing='none'
                    selected={Number(scale.value)}
                    onChange={value => scale.set(value)}
                />
                <Form.Input
                    label={msg('process.retrieve.form.customScale.label')}
                    input={scale}
                    type='number'
                    placeholder={msg('process.retrieve.form.customScale.label')}
                />
            </Layout>
        )
    }
    
    componentDidMount() {
        const {defaultScale, inputs: {scale}} = this.props
        if (!scale.value) {
            scale.set(defaultScale)
        }
    }

    componentDidUpdate() {
        const {toEE, toSepal, user, inputs: {destination}} = this.props
        if (toSepal && !destination.value) {
            destination.set('SEPAL')
        } else if (user.googleTokens && toEE && !destination.value) {
            destination.set('GEE')
        }
    }
}

export const MosaicRetrievePanel = compose(
    _MosaicRetrievePanel,
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
