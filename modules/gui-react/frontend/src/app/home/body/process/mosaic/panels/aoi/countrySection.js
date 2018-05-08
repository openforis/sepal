import actionBuilder from 'action-builder'
import FusionTable from 'app/home/map/fusionTable'
import {map} from 'app/home/map/map'
import Http from 'http-client'
import PropTypes from 'prop-types'
import React from 'react'
import Rx from 'rxjs'
import {connect, select} from 'store'
import {Msg, msg} from 'translate'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {RecipeActions} from '../../mosaicRecipe'
import PanelContent from '../panelContent'

const loadCountries$ = () => {
    const query = `
        SELECT ISO, NAME_FAO 
        FROM 15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F 
        WHERE NAME_FAO NOT EQUAL TO '' 
        ORDER BY NAME_FAO ASC
    `.replace(/\s+/g, ' ').trim()
    const googleKey = map.getKey()
    return Http.get$(`https://www.googleapis.com/fusiontables/v2/query?sql=${query}&key=${googleKey}`)
        .map((e) =>
            actionBuilder('SET_COUNTRIES', {countries: e.response})
                .set('countries', e.response.rows)
                .build()
        )
}

const mapStateToProps = () => {
    return {
        countries: select('countries')
    }
}

class CountrySection extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
        this.countryChanged$ = new Rx.Subject()
    }

    render() {
        const {countries, className, inputs: {section, country}} = this.props
        if (!countries) {
            return <div>Loading countries</div>
        }
        return (
            <PanelContent
                title={msg('process.mosaic.panel.areaOfInterest.form.country.title')}
                className={className}
                onBack={() => {
                    section.set('')
                }}>
                <label><Msg id='process.mosaic.panel.areaOfInterest.form.country.label'/></label>
                <select name="country" value={country.value} onChange={(e) => {
                    country.handleChange(e)
                    country.validate()
                    this.countryChanged$.next()
                }}>
                    {countries.map(([value, label]) =>
                        <option key={value} value={value}>{label}</option>
                    )}
                </select>
                <ErrorMessage input={country}/>
            </PanelContent>
        )
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs === this.props.inputs)
            return

        const {countries, action, asyncActionBuilder, inputs: {country}} = this.props
        if (!countries && !action('LOAD_COUNTRIES').dispatching)
            asyncActionBuilder('LOAD_COUNTRIES',
                loadCountries$())
                .dispatch()

        FusionTable.setLayer({
            id: 'aoi',
            table: '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
            keyColumn: 'ISO',
            key: country.value
        }, this.loadBounds.bind(this))
    }

    loadBounds(fusionTable) {
        this.props.asyncActionBuilder('LOAD_BOUNDS',
            fusionTable.loadBounds$()
                .map(((bounds) => actionBuilder('LOADED_BOUNDS', {bounds})))
                .takeUntil(this.countryChanged$))
            .onComplete(() => map.fitBounds('aoi'))
            .dispatch()
    }
}

CountrySection.propTypes = {
    id: PropTypes.string.isRequired,
    inputs: PropTypes.object.isRequired,
    className: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(CountrySection)
