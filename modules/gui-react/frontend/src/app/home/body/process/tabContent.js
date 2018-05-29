import {map} from 'app/home/map/map'
import flexy from 'flexy.module.css'
import React from 'react'
import {connect, Enabled} from 'store'
import CreateOrLoadRecipe from './createOrLoadRecipe'
import Mosaic from './mosaic/mosaic'
import styles from './process.module.css'

class TabContent extends React.Component {
    render() {
        const {tab: {id, type}, selected} = this.props
        const contents = () => {
            switch (type) {
                case 'mosaic':
                    return <Mosaic id={id}/>
                case 'classification':
                    return <Classification id={id}/>
                default:
                    return <CreateOrLoadRecipe id={id}/>
            }
        }
        return (
            <div className={[styles.tabContent, selected && flexy.container, selected && styles.selected].join(' ')}>
                <Enabled value={selected}>
                    {contents()}
                </Enabled>
            </div>
        )
    }

    componentDidMount() {
        const {tab: {id}} = this.props
        this.props.onEnable(() => {
            if (this.props.selected)
                map.selectLayers(id)
        })
        this.props.onDisable(() => {
            map.deselectLayers(id)
        })
        map.selectLayers(id)
    }

    componentDidUpdate(prevProps) {
        const {tab: {id}, selected} = this.props
        const gotDeselected = prevProps.selected && !selected
        if (gotDeselected)
            map.deselectLayers(id)
        const gotSelected = !prevProps.selected && selected
        if (gotSelected)
            map.selectLayers(id)
    }

    componentWillUnmount() {
        const {tab: {id}} = this.props
        map.removeLayers(id)
    }
}

export default connect()(TabContent)

const Classification = () =>
    <div>
        <h2>Classification</h2>
        <input placeholder='Some input'/>
    </div>