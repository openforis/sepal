import {ErrorMessage} from 'widget/form'
import {Msg, msg} from 'translate'
import {Subject} from 'rxjs'
import {connect, select} from 'store'
import {countryFusionTable, setAoiLayer} from 'app/home/map/aoiLayer'
import {map, takeUntil} from 'rxjs/operators'
import {queryFusionTable$} from 'app/home/map/fusionTable'
import {sepalMap} from 'app/home/map/map'
import ComboBox from 'widget/comboBox'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

const loadCountries$ = () => {
    return queryFusionTable$(`
            SELECT id, label 
            FROM ${countryFusionTable}
            WHERE parent_id != '' 
            ORDER BY label ASC`).pipe(
        map((e) =>
            actionBuilder('SET_COUNTRIES', {countries: e.response})
                .set('countries', e.response.rows)
                .build()
        )
    )
}

const loadCountryAreas$ = (countryId) => {
    return queryFusionTable$(`
            SELECT id, label 
            FROM ${countryFusionTable} 
            WHERE parent_id = '${countryId}'
            ORDER BY label ASC`).pipe(
        map((e) =>
            actionBuilder('SET_COUNTRY_AREA', {countries: e.response})
                .set(['areasByCountry', countryId], e.response.rows)
                .build()
        )
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
        this.aoiChanged$ = new Subject()
        this.update()
    }

    loadCountryAreas(countryId) {
        if (!select(['areasByCountry', countryId]))
            this.props.asyncActionBuilder('LOAD_COUNTRY_AREAS',
                loadCountryAreas$(countryId).pipe(
                    takeUntil(this.aoiChanged$))
            ).dispatch()
    }

    updateBounds(updatedBounds) {
        const {recipeId, inputs: {bounds}} = this.props
        if (!_.isEqual(bounds.value, updatedBounds))
            bounds.set(updatedBounds)
        sepalMap.getContext(recipeId).fitLayer('aoi')
    }

    render() {
        const {action, countries, countryAreas, inputs: {country, area}} = this.props
        const countriesState = action('LOAD_COUNTRIES').dispatching
            ? 'loading'
            : 'loaded'
        const areasState = action('LOAD_COUNTRY_AREAS').dispatching
            ? 'loading'
            : country.value
                ? countryAreas && countryAreas.length > 0 ? 'loaded' : 'noAreas'
                : 'noCountry'
        const countryPlaceholder = msg(`process.mosaic.panel.areaOfInterest.form.country.country.placeholder.${countriesState}`)
        const areaPlaceholder = msg(`process.mosaic.panel.areaOfInterest.form.country.area.placeholder.${areasState}`)
        return (
            <React.Fragment>
                <div>
                    <label><Msg id='process.mosaic.panel.areaOfInterest.form.country.country.label'/></label>
                    <ComboBox
                        input={country}
                        isLoading={action('LOAD_COUNTRIES').dispatching}
                        disabled={!countries}
                        placeholder={countryPlaceholder}
                        options={(countries || []).map(([value, label]) => ({value, label}))}
                        autoFocus={true}
                        onChange={(e) => {
                            area.set('')
                            this.aoiChanged$.next()
                            if (e)
                                this.loadCountryAreas(e.value)
                        }}
                    />
                    <ErrorMessage for={country}/>
                </div>
                <div>
                    <label><Msg id='process.mosaic.panel.areaOfInterest.form.country.area.label'/></label>
                    <ComboBox
                        input={area}
                        isLoading={action('LOAD_COUNTRY_AREAS').dispatching}
                        disabled={!countryAreas || countryAreas.length === 0}
                        placeholder={areaPlaceholder}
                        options={(countryAreas || []).map(([value, label]) => ({value, label}))}
                        onChange={() => this.aoiChanged$.next()}
                    />
                    <ErrorMessage for={area}/>
                </div>
            </React.Fragment>
        )
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {recipeId, countries, action, asyncActionBuilder, inputs: {country, area}, componentWillUnmount$} = this.props
        if (!countries && !action('LOAD_COUNTRIES').dispatching)
            asyncActionBuilder('LOAD_COUNTRIES',
                loadCountries$())
                .dispatch()

        setAoiLayer({
            contextId: recipeId,
            aoi: {
                type: 'COUNTRY',
                countryCode: country.value,
                areaCode: area.value
            },
            fill: true,
            destroy$: componentWillUnmount$,
            onInitialized: (layer) => this.updateBounds(layer.bounds)
        })
    }
}

CountrySection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(CountrySection)
