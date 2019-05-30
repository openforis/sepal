import {CenteredProgress} from 'widget/progress'
import {ContentPadding} from 'widget/sectionLayout'
import {compose} from 'compose'
import {connect} from 'store'
import {forkJoin, timer} from 'rxjs'
import {msg} from 'translate'
import {runApp$} from 'apps'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './appInstance.module.css'

class AppInstance extends React.Component {
    state = {
        appState: 'REQUESTED'
    }

    constructor(props) {
        super(props)
        this.runApp(props.app)
    }

    runApp(app) {
        this.props.stream('RUN_APP',
            forkJoin(
                runApp$(app.path),
                timer(500)
            ),
            () => this.setState({appState: 'INITIALIZED'}),
            () => Notifications.error({message: msg('apps.run.error', {label: app.label || app.alt})})
        )
    }

    initializing(label, alt) {
        return <CenteredProgress title={msg('apps.initializing', {label: label || alt})}/>
    }

    loading(label, alt) {
        return (
            <div className={styles.loading}>
                <CenteredProgress title={msg('apps.loading.progress', {label: label || alt})}/>
            </div>
        )
    }

    renderApp() {
        const {app: {path, label, alt}} = this.props
        const {appState} = this.state
        return (
            <ContentPadding
                menuPadding
                className={styles.appInstance}>
                <iframe
                    width='100%'
                    height='100%'
                    frameBorder='0'
                    src={'/api' + path}
                    title={label || alt}
                    style={{display: appState === 'READY' ? 'block' : 'none'}}
                    onLoad={() => this.setState({appState: 'READY'})}
                />
            </ContentPadding>
        )
    }

    render() {
        const {app: {label, alt}} = this.props
        const {appState} = this.state
        return appState === 'REQUESTED'
            ? this.initializing(label, alt)
            : (
                <React.Fragment>
                    {appState !== 'READY' && this.loading(label, alt)}
                    {this.renderApp()}
                </React.Fragment>
            )
    }
}

AppInstance.propTypes = {
    app: PropTypes.shape({
        alt: PropTypes.string,
        label: PropTypes.string,
        path: PropTypes.string
    })
}

AppInstance.contextTypes = {
    active: PropTypes.bool,
    focus: PropTypes.func
}

export default compose(
    AppInstance,
    connect()
)
