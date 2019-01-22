import {Field, form} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import {currentUser} from 'user'
import {dataSetById} from 'sources'
import {msg} from 'translate'
import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import Buttons from 'widget/buttons'
import Label from 'widget/label'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
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
        sources: recipeState('model.sources'),
        compositeOptions: recipeState('model.compositeOptions'),
        values: recipeState('ui.retrieveOptions'),
        user: currentUser()
    }
}

class Retrieve extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
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

    renderContent() {
        const {user, sources, compositeOptions, inputs: {bands, destination}} = this.props
        const source = Object.keys(sources)[0]
        const correction = source === 'LANDSAT' && compositeOptions.corrections.includes('SR') ? 'SR' : 'TOA'
        const bandsForEachDataSet = _.flatten(Object.values(sources))
            .map(dataSetId => dataSetById[dataSetId][correction].bands)
        const availableBands = new Set(
            _.intersection(...bandsForEachDataSet)
        )

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
                value: 'SEPAL',
                label: msg('process.mosaic.panel.retrieve.form.destination.SEPAL'),
                disabled: !user.googleTokens
            },
            {
                value: 'GEE',
                label: msg('process.mosaic.panel.retrieve.form.destination.GEE')
            }
        ].filter(({value}) => user.googleTokens || value !== 'GEE')

        return (
            <div className={styles.form}>
                <div>
                    <Label msg={msg('process.mosaic.panel.retrieve.form.bands.label')}/>
                    <Buttons
                        input={bands}
                        multiple={true}
                        options={bandOptions}/>
                </div>

                <div>
                    <Label msg={msg('process.mosaic.panel.retrieve.form.destination.label')}/>
                    <Buttons
                        input={destination}
                        multiple={false}
                        options={destinationOptions}/>
                </div>

            </div>
        )
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath(recipeId, 'ui')}
                isActionForm={true}
                onApply={values => this.recipeActions.retrieve(values).dispatch()}>
                <PanelHeader
                    icon='cloud-download-alt'
                    title={msg('process.mosaic.panel.retrieve.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    applyLabel={msg('process.mosaic.panel.retrieve.apply')}/>
            </Panel>
        )
    }

    componentDidUpdate() {
        const {user, inputs: {destination}} = this.props
        if (!user.googleTokens && destination.value !== 'SEPAL')
            destination.set('SEPAL')
    }
}

Retrieve.propTypes = {
    recipeId: PropTypes.string
}

export default form({fields, mapStateToProps})(Retrieve)

const option = band => ({value: band, label: msg(['bands', band])})
