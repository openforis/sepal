import {Button} from 'widget/button'
import {ContentPadding} from 'widget/sectionLayout'
import AppInstance from './appInstance'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import styles from './appLauncher.module.css'

export default class AppLauncher extends React.Component {
    state = {
        app: null
    }

    runApp(app) {
        const {id} = this.props
        this.setState({app})
        actionBuilder('SET_TAB_PLACEHOLDER', {id, app})
            .assignValueByTemplate(['apps.tabs'], {id}, {
                placeholder: app.label || app.alt
            })
            .dispatch()
    }

    renderApp(app) {
        return (
            <Button
                key={app.path}
                look='transparent'
                additionalClassName={styles.app}
                onClick={() => this.runApp(app)}>
                <Image style={app.style} src={app.image}/>
                {app.icon && <Icon name={app.icon} alt={app.alt}/>}
                <div>
                    <div className={styles.title}>{app.label}</div>
                    <div className={styles.description}>{app.description}</div>
                </div>
            </Button>
        )
    }

    renderApps() {
        const {apps} = this.props
        return apps.map(app => this.renderApp(app))
    }

    renderAppLauncher() {
        return (
            <ContentPadding
                menuPadding
                edgePadding
                className={styles.apps}>
                {this.renderApps()}
            </ContentPadding>
        )
    }

    render() {
        const {app} = this.state
        return app
            ? <AppInstance app={app}/>
            : this.renderAppLauncher()
    }
}

const Image = ({style, src, alt}) => {
    return src
        ? <img src={src} alt={alt} style={style}/>
        : null
}

Image.propTypes = {
    alt: PropTypes.string,
    src: PropTypes.string
}
