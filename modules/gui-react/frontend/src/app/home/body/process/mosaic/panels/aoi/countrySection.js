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
        SELECT id, label 
        FROM 1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU 
        WHERE parent_id != '' 
        ORDER BY label ASC
    `.replace(/\s+/g, ' ').trim()
    const googleKey = map.getKey()
    return Http.get$(`https://www.googleapis.com/fusiontables/v2/query?sql=${query}&key=${googleKey}`)
        .delay(2000)
        .map((e) =>
            actionBuilder('SET_COUNTRIES', {countries: e.response})
                .set('countries', e.response.rows)
                .build()
        )
}

const loadCountryAreas$ = (countryId) => {
    const query = `
        SELECT id, label 
        FROM 1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU 
        WHERE parent_id = '${countryId}'
        ORDER BY label ASC
    `.replace(/\s+/g, ' ').trim()
    const googleKey = map.getKey()
    return Http.get$(`https://www.googleapis.com/fusiontables/v2/query?sql=${query}&key=${googleKey}`)
        .delay(2000)
        .map((e) =>
            actionBuilder('SET_COUNTRY_AREA', {countries: e.response})
                .set(['areasByCountry', countryId], e.response.rows)
                .build()
        )
}

const mapStateToProps = (state, ownProps) => {
    return {
        countries: select('countries'),
        countryAreas: select(['areasByCountry', ownProps.inputs.country.value])
    }
}

class CountrySection extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
        this.aoiChanged$ = new Rx.Subject()
    }

    loadCountryAreas(countryId) {
        if (!select(['areasByCountry', countryId])) {
            console.log('Loading country areas')
            this.props.asyncActionBuilder('LOAD_COUNTRY_AREAS',
                loadCountryAreas$(countryId)
                    .takeUntil(this.aoiChanged$))
                .dispatch()
        }
        else
            console.log('Already loaded country areas')
    }

    render() {
        const {countries, countryAreas, className, inputs: {section, country, area}} = this.props
        return (
            <PanelContent
                title={msg('process.mosaic.panel.areaOfInterest.form.country.title')}
                className={className}
                onBack={() => {
                    section.set('')
                }}>
                <label><Msg id='process.mosaic.panel.areaOfInterest.form.country.label'/></label>
                <select name="country" value={country.value} disabled={!countries} onChange={(e) => {
                    country.handleChange(e)
                    country.validate()
                    area.set('')
                    this.aoiChanged$.next()
                    this.loadCountryAreas(e.target.value)
                }}>
                    <option key='' value=''>[Select a country]</option>
                    {(countries || []).map(([value, label]) =>
                        <option key={value} value={value}>{label}</option>
                    )}
                </select>
                <br/><br/>
                <div>
                    <label><Msg id='process.mosaic.panel.areaOfInterest.form.countryArea.label'/></label>
                    <select name="area" value={area.value} disabled={!countryAreas || countryAreas.length === 0} onChange={(e) => {
                        area.handleChange(e)
                        area.validate()
                        this.aoiChanged$.next()
                    }}>
                        <option key='' value=''>[Select an area]</option>
                        {(countryAreas || []).map(([value, label]) =>
                            <option key={value} value={value}>{label}</option>
                        )}
                    </select>
                </div>
                <ErrorMessage input={area}/>
            </PanelContent>
        )
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs === this.props.inputs)
            return

        const {countries, action, asyncActionBuilder, inputs: {country, area}} = this.props
        if (!countries && !action('LOAD_COUNTRIES').dispatching)
            asyncActionBuilder('LOAD_COUNTRIES',
                loadCountries$())
                .dispatch()

        FusionTable.setLayer({
            id: 'aoi',
            table: '1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU',
            keyColumn: 'id',
            key: area.value || country.value
        }, this.loadBounds.bind(this))
    }

    loadBounds(fusionTable) {
        this.props.asyncActionBuilder('LOAD_BOUNDS',
            fusionTable.loadBounds$()
                .map((bounds) => actionBuilder('LOADED_BOUNDS', {bounds}))
                .takeUntil(this.aoiChanged$))
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
