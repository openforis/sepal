import React from 'react'
import Dashboard from './dashboard/dashboard'
import Browse from './browse/browse'
import Terminal from './terminal/terminal'
import {connect} from 'store'
import styles from './body.module.css'
import {Select} from 'widget/selectable'
import Process from './process/process'
import AppLaunchPad from './appLaunchPad/appLaunchPad'
import {loadApps$, requestedApps, runApp$} from 'apps'
import Tasks from './tasks/tasks'
import Users from './users/users'
import Account from './account/account'
import Section from './section'
import {location, isPathInLocation} from 'route'
import IFrame from './iframe'
import {CenteredProgress} from 'widget/progress'
import {msg} from 'translate'
import PropTypes from 'prop-types'

const mapStateToProps = () => ({
    requestedApps: requestedApps(),
    location: location()
})

class Body extends React.Component {
    componentWillMount() {
        this.props.asyncActionBuilder('LOAD_APPS',
            loadApps$())
            .dispatch()
    }

    componentWillReceiveProps({action, location, requestedApps}) {
        if (action('LOAD_APPS').dispatched && isPathInLocation('/app/sandbox')) {
            const path = location.pathname.replace(/^\/app/, '')
            const notRunning = !requestedApps.find((app) => path === app.path)
            if (notRunning)
                this.props.asyncActionBuilder('RUN_APP',
                    runApp$(path))
                    .dispatch()
        }
    }

    render() {
        const {action} = this.props
        const appSections = this.props.requestedApps.map((app) =>
            <Section key={app.path} path={'/app' + app.path}>
                <IFrame app={app}/>
            </Section>
        )

        if (!action('LOAD_APPS').dispatched)
            return <CenteredProgress title={msg('body.loading-apps')}/>
        return (
            <Select className={styles.sections}>
                <Section path='/dashboard'>
                    <Dashboard/>
                </Section>
                <Section path='/process'>
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
        )
    }
}

Body.propTypes = {
    asyncActionBuilder: PropTypes.func,
    action: PropTypes.func,
    location: PropTypes.object, 
    requestedApps: PropTypes.array
}

export default Body = connect(mapStateToProps)(Body)