import React from 'react'
import {connect, select} from 'store'
import Http from 'http-client'
import actionBuilder from 'action-builder'
import styles from './apps.module.css'
import {msg} from 'translate'
import Icon from 'widget/icon'
import rstudioIcon from './r-studio.png'

const mapStateToProps = () => ({
    apps: select('apps')
})

class Apps extends React.Component {
    componentWillMount() {
        this.props.asyncActionBuilder('LOAD_APPS',
            Http.get$('/apps')
                .map((e) =>
                    actionBuilder('SET_APPS')
                        .set('apps', e.response)
                        .build()
                )).dispatch()
    }

    render() {
        const {apps, action} = this.props
        if (!action('LOAD_APPS').dispatched)
            return <div>Spinner</div>

        const dataVis = {path: '/data-vis', label: msg('apps.dataVis'), icon: 'map-o'}
        const rStudio = {path: '/rstudio', image: rstudioIcon, alt: 'RStudio'}
        const items = [dataVis, rStudio, ...apps].map(
            (app) => <App key={app.path} app={app}/>
        )
        return (
            <div className={styles.apps}>
                {items}
            </div>
        )
    }
}

export default Apps = connect(mapStateToProps)(Apps)

const App = ({app: {path, label, icon, image, alt}}) =>
    <div className={styles.app}>
        <Image src={image}/>
        <Icon name={icon} alt={alt}/>
        {label}
    </div>

const Image = ({src, alt}) => {
    if (!src)
        return null
    else
        return <img src={src} alt={alt}/>
}