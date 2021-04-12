import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {currentUser} from 'widget/user'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './retrieve.module.css'

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

class Retrieve extends React.Component {
    state = {
        customScale: false
    }

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
        const {customScale} = this.state
        return (
            <Layout>
                {this.renderBandOptions()}
                {customScale
                    ? this.renderCustomScale()
                    : this.renderPresetScale()
                }

                {toEE && toSepal
                    ? this.renderDestination()
                    : null
                }

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
                options={bandOptions}/>
        )
    }

    renderPresetScale() {
        const {inputs: {scale}} = this.props
        return (
            <div>
                <Form.Slider
                    label={msg('process.retrieve.form.scale.label')}
                    info={scale => msg('process.retrieve.form.scale.info', {scale})}
                    input={scale}
                    minValue={10}
                    maxValue={100}
                    scale={'log'}
                    ticks={[10, 15, 20, 30, 60, 100]}
                    snap
                    range='none'
                />
                <div className={styles.scaleChange}>
                    <Button
                        shape={'none'}
                        label={'Custom scale'}
                        onClick={() => this.setState({customScale: true})}
                    />
                </div>
            </div>
        )
    }

    renderCustomScale() {
        const {inputs: {scale}} = this.props
        return (
            <div>
                <Form.Input
                    label={msg('process.retrieve.form.scale.label')}
                    input={scale}
                    placeholder={msg('process.retrieve.form.scale.label')}
                />
                <div className={styles.scaleChange}>
                    <Button
                        shape={'none'}
                        label={'Preset scale'}
                        onClick={() => this.setState({customScale: false})}
                    />
                </div>
            </div>
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

Retrieve.propTypes = {
    bandOptions: PropTypes.array.isRequired,
    defaultScale: PropTypes.number.isRequired,
    onRetrieve: PropTypes.func.isRequired,
    single: PropTypes.any,
    toEE: PropTypes.any,
    toSepal: PropTypes.any
}

export default compose(
    Retrieve,
    recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})
)
