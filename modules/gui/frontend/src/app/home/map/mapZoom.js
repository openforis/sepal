import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Combo} from 'widget/combo'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {SearchBox} from 'widget/searchBox'
import {Toolbar} from 'widget/toolbar/toolbar'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {msg} from 'translate'
import {withMap} from './mapContext'
import BlurDetector from 'widget/blurDetector'
import PropTypes from 'prop-types'
import React, {createRef} from 'react'
import styles from './mapZoom.module.css'

class _MapZoomPanel extends React.Component {
    state = {
        searchResults: []
    }

    constructor() {
        super()
        this.search = this.search.bind(this)
        // this.bindSearchBox = this.bindSearchBox.bind(this)
    }

    render() {
        const {map, activatable: {deactivate}} = this.props
        const {searchResults} = this.state
        return (
            // <BlurDetector onBlur={deactivate}>
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
                            options={searchResults}
                            onSelect={({value: placeId}) => this.select(placeId)}
                        />
                    </Layout>
                </Panel.Content>
                <Panel.Buttons onEscape={deactivate} shown={false}/>
            </Panel>
            // </BlurDetector>
        )
    }

    componentDidMount() {
        const {map} = this.props
        const {google} = map.getGoogle()
        this.autoComplete = new google.maps.places.AutocompleteService()
        this.geoCoder = new google.maps.Geocoder()
    }

    search(query) {
        if (query) {
            const request = {
                input: query
            }
            this.autoComplete.getPlacePredictions(request, results => {
                if (results) {
                    const searchResults = results.map(({description, place_id}) => ({
                        label: description,
                        value: place_id
                    }))
                    this.setState({searchResults})
                } else {
                    this.geoCoder.geocode({address: query}, result => {
                        console.log(result)
                        // result && map.fitBounds(result[0].geometry.bounds)
                    })
                }
            })
        } else {
            this.setState({searchResults: null})
        }
    }

    select(placeId) {
        const {map} = this.props
        this.geoCoder.geocode({placeId}, results => {
            if (results && results.length) {
                const result = results[0]
                // console.log(result)
                if (result.geometry) {
                    const bounds = result.geometry.bounds
                    const location = result.geometry.location
                    const address = result.formatted_address
                    if (bounds) {
                        map.fitBounds(bounds)
                        map.setRectangle({
                            bounds,
                            title: address
                        })
                    } else if (location) {
                        map.setView({center: location, zoom: 5})
                        map.setMarker({
                            position: location,
                            title: address
                        })
                    }
                }
            }
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

export class MapZoomButton extends React.Component {
    render() {
        return (
            <Activator id={'mapZoom'}>
                {activator => {
                    const {activate, deactivate, active, canActivate} = activator
                    return (
                        <Toolbar.ToolbarButton
                            icon={'search'}
                            tooltip={active ? null : 'zoom'}
                            selected={active}
                            disabled={!canActivate && !active}
                            onClick={() => active ? deactivate() : activate()}
                        />
                    )
                }}
            </Activator>
        )
    }
}
