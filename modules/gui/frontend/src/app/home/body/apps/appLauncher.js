import {Button} from 'widget/button'
import {ContentPadding} from 'widget/sectionLayout'
import {connect} from 'store'
import {selectFrom} from 'collections'
import AppInstance from './appInstance'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import styles from './appLauncher.module.css'

const mapStateToProps = state => ({
    running: _(selectFrom(state, 'apps.tabs'))
        .map(app => app.path)
        .compact()
        .uniq()
        .value()
})

class AppLauncher extends React.Component {
    state = {
        app: null
    }

    runApp(app) {
        const {id} = this.props
        this.setState({app})
        actionBuilder('SET_TAB_PLACEHOLDER', {id, app})
            .assignValueByTemplate(['apps.tabs'], {id}, {
                placeholder: app.label || app.alt,
                path: app.path
            })
            .dispatch()
    }

    renderApp(app) {
        const {running} = this.props
        const disabled = app.single && running.includes(app.path)
        return (
            <Button
                key={app.path}
                look='transparent'
                additionalClassName={styles.app}
                onClick={() => this.runApp(app)}
                disabled={disabled}>
                <Image style={app.style} src={app.image} disabled={disabled}/>
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

export default connect(mapStateToProps)(AppLauncher)

const Image = ({style, src, alt, disabled}) => {
    return src
        ? <img src={src} alt={alt} style={style} className={disabled ? styles.disabled : null}/>
        : null
}

Image.propTypes = {
    alt: PropTypes.string,
    src: PropTypes.string
}
