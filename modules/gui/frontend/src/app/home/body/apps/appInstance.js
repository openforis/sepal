import {Autofit} from 'widget/autofit'
import {ContentPadding} from 'widget/sectionLayout'
import {compose} from 'compose'
import {connect} from 'store'
import {forkJoin, timer} from 'rxjs'
import {msg} from 'translate'
import {runApp$} from 'apps'
import Icon from 'widget/icon'
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

    render() {
        const {app: {path, label, alt}} = this.props
        const {appState} = this.state
        return (
            <ContentPadding
                menuPadding
                className={styles.appInstance}>
                <div className={styles.content}>
                    <Autofit className={styles.spinner}>
                        <Icon name='circle-notch' size='10x' spin/>
                    </Autofit>
                    <Autofit className={styles.backdrop}>
                        {label || alt}
                    </Autofit>
                    <div className={styles.status}>
                        {this.renderStatus()}
                    </div>
                    <iframe
                        width='100%'
                        height='100%'
                        frameBorder='0'
                        src={'/'}
                        // src={'/api' + path}
                        title={label || alt}
                        style={{display: appState === 'READY' ? 'block' : 'none'}}
                        onLoad={() => this.setState({appState: 'READY'})}
                    />
                </div>
            </ContentPadding>
        )
    }

    renderStatus() {
        const {appState} = this.state
        return appState === 'REQUESTED'
            ? msg('apps.initializing')
            : appState !== 'READY'
                ? msg('apps.loading.progress')
                : null
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
