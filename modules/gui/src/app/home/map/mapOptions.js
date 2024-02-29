import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {Slider} from 'widget/slider'
import {Toolbar} from 'widget/toolbar/toolbar'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withActivatable} from 'widget/activation/activatable'
import {withMap} from './mapContext'
import {withRecipe} from '../body/process/recipeContext'
import {withSubscriptions} from 'subscription'
import BlurDetector from 'widget/blurDetector'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapOptions.module.css'

const FULL_TILE_SIZE = 256

const mapRecipeToProps = recipe => ({
    retile: selectFrom(recipe, 'retile') || FULL_TILE_SIZE
})

class _MapOptionsPanel extends React.Component {
    state = {
        linked: null
    }

    constructor(props) {
        super(props)
        this.close = this.close.bind(this)
        this.setRetile = this.setRetile.bind(this)
    }

    render() {
        return (
            <Panel className={styles.panel} type='top-right'>
                <BlurDetector onBlur={this.close}>
                    <Panel.Content>
                        <Layout>
                            {this.renderMapLinkControl()}
                            {this.renderMapRetileControl()}
                        </Layout>
                    </Panel.Content>
                </BlurDetector>
                <Keybinding keymap={{'Escape': this.close}}/>
            </Panel>
        )
    }

    renderMapLinkControl() {
        const {map} = this.props
        const {linked} = this.state
        const options = [{
            label: msg('process.mosaic.mapOptions.location.independent'),
            value: false
        }, {
            label: msg('process.mosaic.mapOptions.location.synchronized'),
            value: true,
            options: linked ? null : [{
                label: msg('process.mosaic.mapOptions.location.getOther'),
                key: 'syncIn',
                value: {synchronizeIn: true}
            }, {
                label: msg('process.mosaic.mapOptions.location.useCurrent'),
                key: 'syncOut',
                value: {synchronizeOut: true}
            }]
        }]
        return (
            <Buttons
                label={msg('process.mosaic.mapOptions.location.label')}
                tooltip={msg('process.mosaic.mapOptions.location.tooltip')}
                options={options}
                selected={linked}
                onChange={(linked, synchronize) => map.setLinked(linked, synchronize)}
            />
        )
    }

    getRetile(subdivisions) {
        return FULL_TILE_SIZE / subdivisions
    }

    getSubdivisions(retile) {
        return FULL_TILE_SIZE / retile
    }

    renderMapRetileControl() {
        const {retile} = this.props
        const subdivisions = this.getSubdivisions(retile)
        return (
            <Widget
                label={msg('process.mosaic.mapOptions.retile.label')}
                tooltip={msg('process.mosaic.mapOptions.retile.tooltip')}
                tooltipSeverity={subdivisions === 1 ? 'info' : 'warning'}
                spacing='compact'
            >
                <div className={[
                    styles.retile,
                    styles[`retile-${subdivisions}`]
                ].join(' ')} style={{'--subdivisions': subdivisions}}/>
                <Slider
                    value={subdivisions}
                    minValue={1}
                    maxValue={16}
                    ticks={[{value: 1, label: 1}, {value: 2, label: 4}, {value: 4, label: 16}, {value: 8, label: 64}, {value: 16, label: 256}]}
                    snap
                    scale='log'
                    onChange={this.setRetile}
                />
            </Widget>
        )
    }

    setRetile(subdivisions) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('SET_RETILE')
            .set('retile', this.getRetile(subdivisions))
            .dispatch()
    }

    close() {
        const {activatable: {deactivate}} = this.props
        deactivate()
    }

    componentDidMount() {
        const {map, addSubscription} = this.props
        addSubscription(
            map.linked$.subscribe(
                ({linked}) => this.setState({linked})
            )
        )
    }
}

const policy = () => ({
    mapZoom: 'allow-then-deactivate',
    _: 'allow'
})

export const MapOptionsPanel = compose(
    _MapOptionsPanel,
    withMap(),
    withRecipe(mapRecipeToProps),
    withSubscriptions(),
    withActivatable({
        id: 'mapOptions',
        policy,
        alwaysAllow: true
    })
)

MapOptionsPanel.propTypes = {
    statePath: PropTypes.any.isRequired
}

const _MapOptionsButton = ({retile}) =>
    <Toolbar.ActivationButton
        id='mapOptions'
        icon='gear'
        iconVariant={retile === FULL_TILE_SIZE ? 'normal' : 'warning'}
        tooltip={msg('process.mosaic.mapToolbar.options.tooltip')}/>

export const MapOptionsButton = compose(
    _MapOptionsButton,
    withRecipe(mapRecipeToProps)
)
