import {CenteredProgress} from 'widget/progress'
import {Select} from 'widget/selectable'
import {connect, select} from 'store'
import {history, isPathInLocation, location} from 'route'
import {initGoogleMapsApi$} from '../map/map'
import {loadApps$, requestedApps, runApp$} from 'apps'
import {msg} from 'translate'
import Account from './account/account'
import AppLaunchPad from './appLaunchPad/appLaunchPad'
import Browse from './browse/browse'
import IFrame from './iframe'
import Process from './process/process'
import PropTypes from 'prop-types'
import React from 'react'
import Section from './section'
import Tasks from './tasks/tasks'
import Terminal from './terminal/terminal'
import Users from './users/users'
import styles from './body.module.css'

const mapStateToProps = () => ({
    requestedApps: requestedApps(),
    location: location(),
    budgetExceeded: select('user.budgetExceeded'),
})

class Body extends React.Component {
    UNSAFE_componentWillMount() {
        this.props.asyncActionBuilder('LOAD_APPS',
            loadApps$())
            .dispatch()
        this.props.asyncActionBuilder('INIT_GOOGLE_MAPS_API',
            initGoogleMapsApi$())
            .dispatch()
    }

    componentDidUpdate() {
        const {budgetExceeded, location} = this.props
        if (budgetExceeded && location.pathname !== '/browse')
            history().replace('/browse').dispatch()
        else if (this.props.location.pathname === '/')
            history().replace('/process').dispatch()
    }

    UNSAFE_componentWillReceiveProps({action, location, requestedApps}) {
        if (action('LOAD_APPS').dispatched && isPathInLocation('/app/sandbox')) {
            const path = location.pathname.replace(/^\/app/, '')
            const notRunning = !requestedApps.find(app => path === app.path)
            if (notRunning)
                this.props.asyncActionBuilder('RUN_APP',
                    runApp$(path))
                    .dispatch()
        }
    }

    render() {
        const {action, className} = this.props
        const appSections = this.props.requestedApps.map(app =>
            <Section key={app.path} path={'/app' + app.path} className={styles.app}>
                <IFrame app={app}/>
            </Section>
        )

        if (!action('LOAD_APPS').dispatched || !action('INIT_GOOGLE_MAPS_API').dispatched) {
            const progressMessageId = action('LOAD_GOOGLE_MAPS_API_KEY').dispatching
                ? 'body.initializing-google-maps'
                : action('LOAD_APPS').dispatching
                    ? 'body.loading-apps'
                    : 'body.starting-sepal'
            return <CenteredProgress title={msg(progressMessageId)} className={className}/>
        }
        return (
            <div className={className}>
                <Select className={styles.sections}>
                    <Section path='/process' captureMouseEvents={false}>
                        <Process/>
                    </Section>
                    <Section path='/browse'>
                        <Browse/>
                    </Section>
                    <Section path='/app-launch-pad'>
                        <AppLaunchPad/>
                    </Section>
                    <Section path='/terminal'>
                        <Terminal/>
                    </Section>
                    <Section path='/tasks'>
                        <Tasks/>
                    </Section>
                    <Section path='/users'>
                        <Users/>
                    </Section>
                    <Section path='/account'>
                        <Account/>
                    </Section>
                    {appSections}
                </Select>
            </div>
        )
    }
}

Body.propTypes = {
    className: PropTypes.string,
    location: PropTypes.object,
    requestedApps: PropTypes.array
}

export default connect(mapStateToProps)(Body)
