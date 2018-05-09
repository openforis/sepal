import actionBuilder from 'action-builder'
import FusionTable from 'app/home/map/fusionTable'
import {map} from 'app/home/map/map'
import Http from 'http-client'
import PropTypes from 'prop-types'
import React from 'react'
import Rx from 'rxjs'
import {connect, select} from 'store'
import {Msg, msg} from 'translate'
import ComboBox from 'widget/comboBox'
import {ErrorMessage} from 'widget/form'
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
        const {action, countries, countryAreas, className, inputs: {section, country, area}} = this.props
        return (
            <PanelContent
                title={msg('process.mosaic.panel.areaOfInterest.form.country.title')}
                className={className}
                onBack={() => {
                    section.set('')
                }}>

                <div>
                    <label><Msg id='process.mosaic.panel.areaOfInterest.form.country.country.label'/></label>
                    <ComboBox
                        input={country}
                        isLoading={action('LOAD_COUNTRIES').dispatching}
                        disabled={!countries}
                        placeholder={msg('process.mosaic.panel.areaOfInterest.form.country.country.placeholder')}
                        options={(countries || []).map(([value, label]) => ({value, label}))}
                        onChange={(e) => {
                            area.set('')
                            this.aoiChanged$.next()
                            if (e)
                                this.loadCountryAreas(e.value)
                        }}
                    />
                    <ErrorMessage input={country}/>
                </div>
                <div>
                    <label><Msg id='process.mosaic.panel.areaOfInterest.form.country.area.label'/></label>
                    <ComboBox
                        input={area}
                        isLoading={action('LOAD_COUNTRY_AREAS').dispatching}
                        disabled={!countryAreas || countryAreas.length === 0}
                        placeholder={msg('process.mosaic.panel.areaOfInterest.form.country.area.placeholder')}
                        options={(countryAreas || []).map(([value, label]) => ({value, label}))}
                        onChange={(e) => {
                            area.set('')
                            this.aoiChanged$.next()
                            if (e)
                                this.loadCountryAreas(e.value)
                        }}
                    />
                    <ErrorMessage input={area}/>
                </div>
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
