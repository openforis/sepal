import {Button} from 'widget/button'
import {ContentPadding} from 'widget/sectionLayout'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import AppInstance from './appInstance'
import Icon from 'widget/icon'
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
            .assign(['apps.tabs', {id}], {
                placeholder: app.label || app.alt,
                path: app.path
            })
            .dispatch()
    }

    renderImage({image, alt, style}, disabled) {
        return image
            ? <img
                src={image}
                alt={alt}
                className={disabled ? styles.disabled : null}
                style={style}/>
            : null
    }

    renderApp(app) {
        const {running = []} = this.props
        const disabled = app.single && running.includes(app.path)
        return (
            <Button
                key={app.path}
                look='transparent'
                width='fill'
                additionalClassName={styles.app}
                onClick={() => this.runApp(app)}
                disabled={disabled}>
                {this.renderImage(app, disabled)}
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
            <ContentPadding menuPadding horizontalPadding>
                <ScrollableContainer>
                    <Scrollable direction='y' className={styles.apps}>
                        {this.renderApps()}
                    </Scrollable>
                </ScrollableContainer>
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
