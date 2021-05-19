import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {SearchBox} from 'widget/searchBox'
import {Toolbar} from 'widget/toolbar/toolbar'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {formatCoordinates, parseCoordinates} from 'coords'
import {msg} from 'translate'
import {withMap} from './mapContext'
import React from 'react'
import styles from './mapZoom.module.css'

class _MapZoomPanel extends React.Component {
    state = {
        coordinateResults: [],
        placeResults: []
    }

    constructor() {
        super()
        this.search = this.search.bind(this)
    }

    render() {
        const {map, activatable: {deactivate}} = this.props
        const {coordinateResults, placeResults} = this.state
        return (
            <Panel className={styles.panel} type='top-right'>
                <Panel.Content>
                    <Layout spacing='compact'>
                        <ButtonGroup alignment='fill'>
                            <Button
                                disabled={!map.canZoomIn()}
                                onClick={() => map.zoomIn()}
                                icon={'plus'}
                                tooltip={msg('process.mapZoom.zoomIn.tooltip')}
                                tooltipPlacement='bottom'
                            />
                            <Button
                                disabled={!map.canZoomOut()}
                                onClick={() => map.zoomOut()}
                                icon={'minus'}
                                tooltip={msg('process.mapZoom.zoomOut.tooltip')}
                                tooltipPlacement='bottom'
                            />
                            <Button
                                look={map.isZoomArea() ? 'highlight' : 'default'}
                                disabled={!map.canZoomArea()}
                                onClick={() => map.toggleZoomArea()}
                                icon={'crop-alt'}
                                tooltip={msg('process.mapZoom.zoomArea.tooltip')}
                                tooltipPlacement='bottom'
                            />
                            <Button
                                disabled={!map.canFit()}
                                onClick={() => map.fit()}
                                icon={'bullseye'}
                                tooltip={msg('process.mapZoom.fit.tooltip')}
                                tooltipPlacement='bottom'
                            />
                        </ButtonGroup>
                        <SearchBox
                            placeholder={msg('process.mapZoom.search.placeholder')}
                            className={styles.search}
                            onSearchValue={this.search}
                            options={[
                                ...coordinateResults,
                                ...placeResults
                            ]}
                            onSelect={({value: location}) => this.select(location)}
                        />
                    </Layout>
                </Panel.Content>
                <Panel.Buttons onEscape={deactivate} shown={false}/>
            </Panel>
        )
    }

    componentDidMount() {
        const {map} = this.props
        const {google} = map.getGoogle()
        this.autoComplete = new google.maps.places.AutocompleteService()
        this.geoCoder = new google.maps.Geocoder()
    }

    search(query) {
        this.searchCoordinates(query)
        this.searchPlace(query)
    }

    searchCoordinates(query) {
        const {map} = this.props
        const {google} = map.getGoogle()
        if (query) {
            const candidates = parseCoordinates(query)
            const coordinateResults = candidates.map(candidate => ({
                label: (
                    <div className={styles.coordinates}>
                        <div>Latitude: {candidate.lat}</div>
                        <div>Longitude: {candidate.lng}</div>
                    </div>
                ),
                value: {
                    coords: new google.maps.LatLng(candidate.lat, candidate.lng)
                },
                key: formatCoordinates(candidate)
            }))
            this.setState({coordinateResults})
        } else {
            this.setState({coordinateResults: []})
        }
    }

    searchPlace(query) {
        if (query) {
            const request = {
                input: query
            }
            this.autoComplete.getPlacePredictions(request, results => {
                if (results) {
                    const placeResults = results.map(({description, place_id}) => ({
                        label: description,
                        value: {placeId: place_id},
                        key: place_id
                    }))
                    this.setState({placeResults})
                }
            })
        } else {
            this.setState({placeResults: []})
        }
    }

    select({placeId, coords}) {
        if (placeId) {
            this.geoCoder.geocode({placeId}, results => {
                if (results && results.length) {
                    const result = results[0]
                    // console.log(result)
                    if (result.geometry) {
                        const bounds = result.geometry.bounds
                        const location = result.geometry.location
                        const address = result.formatted_address
                        if (bounds) {
                            this.selectArea({bounds, title: address})
                        } else if (location) {
                            this.selectPoint({location, title: address})
                        }
                    }
                }
            })
        } else if (coords) {
            this.selectPoint({location: coords, title: 'point'})
        }
    }

    selectArea({bounds, title}) {
        const {map} = this.props
        map.fitBounds(bounds)
        map.setRectangle({
            bounds,
            title
        })
    }

    selectPoint({location, title}) {
        const {map} = this.props
        map.setView({center: location, zoom: 11})
        map.setMarker({
            position: location,
            title
        })
    }
}

const policy = () => ({
    _: 'allow-then-deactivate'
})

export const MapZoomPanel = compose(
    _MapZoomPanel,
    withMap(),
    activatable({
        id: 'mapZoom',
        policy
    })

)
