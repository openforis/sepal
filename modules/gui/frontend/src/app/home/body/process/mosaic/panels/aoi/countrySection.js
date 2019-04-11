import {ErrorMessage} from 'widget/form'
import {Subject} from 'rxjs'
import {connect, select} from 'store'
import {countryFusionTable, setAoiLayer} from 'app/home/map/aoiLayer'
import {isMobile} from 'widget/userAgent'
import {map, takeUntil} from 'rxjs/operators'
import {msg} from 'translate'
import {queryFusionTable$} from 'app/home/map/fusionTable'
import {sepalMap} from 'app/home/map/map'
import Combo from 'widget/combo'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'

const loadCountries$ = () => {
    return queryFusionTable$(`
            SELECT id, label 
            FROM ${countryFusionTable}
            WHERE parent_id != '' 
            ORDER BY label ASC`).pipe(
        map(e =>
            actionBuilder('SET_COUNTRIES', {countries: e.response})
                .set('countries', e.response.rows)
                .dispatch()
        )
    )
}

const loadCountryForArea$ = areaId => {
    return queryFusionTable$(`
            SELECT parent_id 
            FROM ${countryFusionTable} 
            WHERE id = '${areaId}'
            ORDER BY label ASC`).pipe(
        map(e =>
            e.response.rows && e.response.rows.length === 1 && e.response.rows[0][0]
        )
    )
}

const loadCountryAreas$ = countryId => {
    return queryFusionTable$(`
            SELECT id, label 
            FROM ${countryFusionTable} 
            WHERE parent_id = '${countryId}'
            ORDER BY label ASC`).pipe(
        map(e =>
            actionBuilder('SET_COUNTRY_AREA', {countries: e.response})
                .set(['areasByCountry', countryId], e.response.rows)
                .dispatch()
        )
    )
}

const mapStateToProps = (state, ownProps) => {
    return {
        countries: select('countries'),
        countryAreas: select(['areasByCountry', ownProps.inputs.country.value]),
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
            this.props.stream('LOAD_COUNTRY_AREAS',
                loadCountryAreas$(countryId).pipe(
                    takeUntil(this.aoiChanged$)
                ))
    }

    render() {
        const {stream, countries, countryAreas, inputs: {country, area}} = this.props
        const countriesState = stream('LOAD_COUNTRIES').active
            ? 'loading'
            : 'loaded'
        const areasState = stream('LOAD_COUNTRY_AREAS').active
            ? 'loading'
            : country.value
                ? countryAreas && countryAreas.length > 0 ? 'loaded' : 'noAreas'
                : 'noCountry'
        const countryPlaceholder = msg(`process.mosaic.panel.areaOfInterest.form.country.country.placeholder.${countriesState}`)
        const areaPlaceholder = msg(`process.mosaic.panel.areaOfInterest.form.country.area.placeholder.${areasState}`)
        return (
            <React.Fragment>
                <div>
                    <Label msg={msg('process.mosaic.panel.areaOfInterest.form.country.country.label')}/>
                    <Combo
                        input={country}
                        placement='below'
                        options={(countries || []).map(([value, label]) => ({value, label}))}
                        placeholder={countryPlaceholder}
                        busy={stream('LOAD_COUNTRIES').active}
                        disabled={!countries}
                        autoFocus={!isMobile()}
                        onChange={e => {
                            area.set('')
                            this.aoiChanged$.next()
                            if (e)
                                this.loadCountryAreas(e.value)
                        }}
                    />
                    <ErrorMessage for={country}/>
                </div>
                <div>
                    <Label msg={msg('process.mosaic.panel.areaOfInterest.form.country.area.label')}/>
                    <Combo
                        input={area}
                        placement='below'
                        options={(countryAreas || []).map(([value, label]) => ({value, label}))}
                        placeholder={areaPlaceholder}
                        busy={stream('LOAD_COUNTRY_AREAS').active}
                        disabled={!countryAreas || countryAreas.length === 0}
                        onChange={() => this.aoiChanged$.next()}
                    />
                    <ErrorMessage for={area}/>
                </div>
            </React.Fragment>
        )
    }

    componentDidMount() {
        const {stream, inputs: {country, area}} = this.props
        if (area.value && !country.value)
            stream('LOAD_COUNTRY_FOR_AREA',
                loadCountryForArea$(area.value).pipe(
                    map(countryId => {
                        country.setInitialValue(countryId)
                        this.loadCountryAreas(countryId)
                    })
                ))
        this.update()
        if (country.value)
            this.loadCountryAreas(country.value)
    }

    componentDidUpdate(prevProps) {
        if (!prevProps || prevProps.inputs !== this.props.inputs)
            this.update(prevProps)
    }

    update() {
        const {recipeId, countries, stream, inputs: {country, area}, componentWillUnmount$} = this.props
        if (!countries && !stream('LOAD_COUNTRIES').active)
            this.props.stream('LOAD_COUNTRIES',
                loadCountries$())

        setAoiLayer({
            contextId: recipeId,
            aoi: {
                type: 'COUNTRY',
                countryCode: country.value,
                areaCode: area.value
            },
            fill: true,
            destroy$: componentWillUnmount$,
            onInitialized: () => sepalMap.getContext(recipeId).fitLayer('aoi')
        })
    }
}

CountrySection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(CountrySection)

