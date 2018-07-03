import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {dataSetById} from 'sources'
import {msg, Msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field, form, Label} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
import styles from './retrieve.module.css'

const fields = {
    bands: new Field()
        .predicate(bands => bands && bands.length, 'process.mosaic.panel.retrieve.form.bands.atLeastOne'),
    destination: new Field()
        .notEmpty('process.mosaic.panel.retrieve.form.destination.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        sources: recipeState('sources'),
        compositeOptions: recipeState('compositeOptions'),
        values: recipeState('ui.retrieve')
    }
}

class Retrieve extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
        this.allBandOptions = [
            {
                options: [
                    option('blue'),
                    option('green'),
                    option('red'),
                    option('nir'),
                    option('swir1'),
                    option('swir2')
                ]
            },
            {
                options: [
                    option('redEdge1'),
                    option('redEdge2'),
                    option('redEdge3'),
                    option('redEdge4')
                ]
            },
            {
                options: [
                    option('aerosol'),
                    option('waterVapor'),
                    option('pan'),
                    option('cirrus'),
                    option('thermal'),
                    option('thermal2')
                ]
            },
            {
                options: [
                    option('unixTimeDays'),
                    option('dayOfYear'),
                    option('daysFromTarget')
                ]
            }
        ]
    }

    render() {
        const {recipeId, sources, compositeOptions, form, inputs: {bands, destination}, className} = this.props
        const dataSets = _.flatten(Object.values(sources))
        const availableBands = new Set(_.flatten(dataSets.map(dataSetId => dataSetById[dataSetId].bands)))

        if (compositeOptions.corrections.includes('SR'))
            availableBands.delete('pan')

        if (compositeOptions.compose !== 'MEDIAN')
            ['unixTimeDays', 'dayOfYear', 'daysFromTarget'].forEach(band => availableBands.add(band))

        const bandOptions = this.allBandOptions
            .map(group => ({
                    ...group,
                    options: group.options.filter(option => availableBands.has(option.value))
                })
            )
            .filter(group =>
                group.options.length
            )
        const destinationOptions = [
            {
                value: 'sepal',
                label: 'Sepal workspace'
            },
            {
                value: 'google',
                label: 'Google Earth Engine asset'
            }
        ]

        return (
            <form className={[className, styles.container].join(' ')}>
                <PanelForm
                    recipeId={recipeId}
                    form={form}
                    applyLabel={msg('process.mosaic.panel.retrieve.apply')}
                    isActionForm={true}
                    onApply={(recipe, values) => recipe.retrieve(values).dispatch()}
                    icon='cloud-download-alt'
                    title={msg('process.mosaic.panel.retrieve.title')}>
                    <div className={styles.form}>
                        <div>
                            <Label>
                                <Msg id='process.mosaic.panel.retrieve.form.bands.label'/>
                            </Label>
                            <Buttons
                                input={bands}
                                multiple={true}
                                options={bandOptions}/>
                        </div>

                        <div>
                            <Label>
                                <Msg id='process.mosaic.panel.retrieve.form.destination.label'/>
                            </Label>
                            <Buttons
                                input={destination}
                                multiple={false}
                                options={destinationOptions}/>
                        </div>

                    </div>
                </PanelForm>
            </form>
        )
    }
}

Retrieve.propTypes = {
    recipeId: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    fields: PropTypes.object,
    action: PropTypes.func,
    values: PropTypes.object
}

export default form({fields, mapStateToProps})(Retrieve)

const option = (band) => ({value: band, label: msg(['bands', band])})
