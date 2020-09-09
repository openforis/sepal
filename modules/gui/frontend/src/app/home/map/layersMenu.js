import {compose} from 'compose'
import {activatable} from 'widget/activation/activatable'
import React from 'react'
import styles from './layersMenu.module.css'
import Labels from './labels'
import {Menu} from './menu'
import {connect, select} from '../../../store'
import PropTypes from 'prop-types'
import {changeBaseLayer} from './baseLayer'
import Icon from '../../../widget/icon'

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
                    label={'Base layer'}
                    onSelect={type => changeBaseLayer({type, mapContext, statePath})}
                    selected={baseLayer || 'SEPAL'}>
                    <Menu.Option
                        id={'SEPAL'}
                        label={'Sepal'}
                    description={'Simple dark default Sepal layer'}/>
                    <Menu.Option
                        id={'GOOGLE_SATELLITE'}
                        label={'Google Satellite'}
                        description={'Google Maps high-resolution satellite layer'}/>
                    <Menu.Option
                        id={'SENTINEL_2'}
                        label={'Sentinel 2'}
                        description={'Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2019)'}
                        right={
                            <a target={'_blank'} href={'https://s2maps.eu/'}>
                                <Icon name={'external-link-alt'}/>
                            </a>
                        }/>
                </Menu.Select>
                <Menu.Separator/>
                <Menu.Toggle
                    id={'SHOW_LABELS'}
                    label={'Show Labels'}
                    description={'Show map labels, roads and points of interest'}
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