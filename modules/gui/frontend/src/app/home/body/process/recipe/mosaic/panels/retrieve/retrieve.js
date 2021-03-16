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
        .predicate(bands => bands && bands.length, 'process.mosaic.panel.retrieve.form.bands.atLeastOne'),
    scale: new Form.Field(),
    destination: new Form.Field()
        .notEmpty('process.mosaic.panel.retrieve.form.destination.required')
}

const mapRecipeToProps = () => ({
    user: currentUser()
})

class Retrieve extends React.Component {
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
                    title={msg('process.mosaic.panel.retrieve.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons
                    applyLabel={msg('process.mosaic.panel.retrieve.apply')}/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {bandOptions, single, toSepal, toEE, user, inputs: {bands, scale, destination}} = this.props
        const destinationOptions = [
            {
                value: 'SEPAL',
                label: msg('process.mosaic.panel.retrieve.form.destination.SEPAL')
            },
            {
                value: 'GEE',
                label: msg('process.mosaic.panel.retrieve.form.destination.GEE')
            }
        ]
            .filter(({value}) => user.googleTokens || value !== 'GEE')
            .filter(({value}) => toSepal || value !== 'SEPAL')
            .filter(({value}) => toEE || value !== 'GEE')
        return (
            <Layout>
                <Form.Buttons
                    label={msg('process.mosaic.panel.retrieve.form.bands.label')}
                    input={bands}
                    multiple={!single}
                    options={bandOptions}/>
                <Form.Slider
                    label={msg('process.radarMosaic.panel.retrieve.form.scale.label')}
                    info={scale => msg('process.radarMosaic.panel.retrieve.form.scale.info', {scale})}
                    input={scale}
                    minValue={10}
                    maxValue={100}
                    scale={'log'}
                    ticks={[10, 15, 20, 30, 60, 100]}
                    snap
                    range='none'
                />
                {toEE && toSepal
                    ? <Form.Buttons
                        label={msg('process.mosaic.panel.retrieve.form.destination.label')}
                        input={destination}
                        multiple={false}
                        options={destinationOptions}/>
                    : null
                }

            </Layout>
        )
    }

    componentDidUpdate() {
        const {defaultScale, toEE, toSepal, user, inputs: {destination, scale}} = this.props
        if (toSepal && !destination.value) {
            destination.set('SEPAL')
        } else if (user.googleTokens && toEE && !destination.value) {
            destination.set('GEE')
        }
        if (!scale.value) {
            scale.set(defaultScale)
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
