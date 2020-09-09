import {compose} from 'compose'
import {activatable} from 'widget/activation/activatable'
import React from 'react'
import styles from './layersMenu.module.css'
import Labels from './labels'
import {Menu} from './menu'
import {connect, select} from 'store'
import PropTypes from 'prop-types'
import {changeBaseLayer} from './baseLayer'
import Icon from 'widget/icon'
import {msg} from 'translate'

const mapStateToProps = (state, ownProps) => ({
    labelsShown: select([ownProps.statePath, 'labelsShown']),
    baseLayer: select([ownProps.statePath, 'baseLayer'])
})

class _LayersMenu extends React.Component {
    render() {
        const {activatable: {deactivate}, labelsShown, baseLayer, labelLayerIndex, statePath, mapContext} = this.props
        return (
            <Menu
                position='top-right'
                className={styles.panel}
                close={deactivate}>
                <Menu.Select
                    id={'BASE_LAYER'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.baseLayer')}
                    onSelect={type => changeBaseLayer({type, mapContext, statePath})}
                    selected={baseLayer || 'SEPAL'}>
                    <Menu.Option
                        id={'SEPAL'}
                        label={msg('process.mosaic.mapToolbar.layersMenu.SEPAL.label')}
                        description={msg('process.mosaic.mapToolbar.layersMenu.SEPAL.description')}/>
                    <Menu.Option
                        id={'GOOGLE_SATELLITE'}
                        label={msg('process.mosaic.mapToolbar.layersMenu.GOOGLE_SATELLITE.label')}
                        description={msg('process.mosaic.mapToolbar.layersMenu.GOOGLE_SATELLITE.description')}/>
                    <Menu.Option
                        id={'SENTINEL_2'}
                        label={msg('process.mosaic.mapToolbar.layersMenu.SENTINEL_2.label')}
                        description={msg('process.mosaic.mapToolbar.layersMenu.SENTINEL_2.description')}
                        right={
                            <a target={'_blank'} href={'https://s2maps.eu/'}>
                                <Icon name={'external-link-alt'}/>
                            </a>
                        }/>
                </Menu.Select>
                <Menu.Separator/>
                <Menu.Toggle
                    id={'SHOW_LABELS'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.labels.label')}
                    description={msg('process.mosaic.mapToolbar.layersMenu.labels.description')}
                    selected={labelsShown}
                    onChange={shown =>
                        Labels.showLabelsAction({
                            shown,
                            layerIndex: labelLayerIndex,
                            statePath,
                            mapContext
                        }).dispatch()}/>
            </Menu>
        )
    }
}

const policy = () => ({
    _: 'allow'
})
export const LayersMenu = compose(
    _LayersMenu,
    connect(mapStateToProps),
    activatable({id: 'layersMenu', policy})
)

LayersMenu.propTypes = {
    labelLayerIndex: PropTypes.any.isRequired,
    mapContext: PropTypes.string.isRequired,
    statePath: PropTypes.any.isRequired
}