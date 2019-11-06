import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {countryEETable, setAoiLayer} from 'app/home/map/aoiLayer'
import {map, takeUntil} from 'rxjs/operators'
import {msg} from 'translate'
import {sepalMap} from 'app/home/map/map'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'

const loadCountries$ = () => {
    return api.gee.queryEETable$({
        select: ['id', 'label'],
        from: countryEETable,
        where: [['parent_id', 'equals', '']],
        orderBy: ['label']
    }).pipe(
        map(countries => countries.map(({id, label}) => ({value: id, label}))),
        map(countries =>
            actionBuilder('SET_COUNTRIES', {countries})
                .set('countries', countries)
                .dispatch()
        )
    )
}

const loadCountryForArea$ = areaId => {
    return api.gee.queryEETable$({
        select: ['parent_id'],
        from: countryEETable,
        where: [['id', 'equals', areaId]],
        orderBy: ['label']
    })
}

const loadCountryAreas$ = countryId => {
    return api.gee.queryEETable$({
        select: ['id', 'label'],
        from: countryEETable,
        where: [['parent_id', 'equals', countryId]],
        orderBy: ['label']
    }).pipe(
        map(countries => countries.map(({id, label}) => ({value: id, label}))),
        map(areas =>
            actionBuilder('SET_COUNTRY_AREA', {countryId, areas})
                .set(['areasByCountry', countryId], areas)
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
            <Layout>
                <Form.Combo
                    label={msg('process.mosaic.panel.areaOfInterest.form.country.country.label')}
                    input={country}
                    placement='below'
                    options={countries || []}
                    placeholder={countryPlaceholder}
                    busy={stream('LOAD_COUNTRIES').active}
                    disabled={!countries}
                    autoFocus
                    onChange={option => {
                        area.set('')
                        this.aoiChanged$.next()
                        this.loadCountryAreas(option.value)
                    }}
                />
                <Form.Combo
                    label={msg('process.mosaic.panel.areaOfInterest.form.country.area.label')}
                    input={area}
                    placement='below'
                    options={(countryAreas || [])}
                    placeholder={areaPlaceholder}
                    busy={stream('LOAD_COUNTRY_AREAS').active}
                    disabled={!countryAreas || countryAreas.length === 0}
                    onChange={() => this.aoiChanged$.next()}
                />
            </Layout>
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
            // destroy$: componentWillUnmount$,
            onInitialized: () => sepalMap.getContext(recipeId).fitLayer('aoi')
        })
    }
}

CountrySection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired
}

export default compose(
    CountrySection,
    connect(mapStateToProps)
)
