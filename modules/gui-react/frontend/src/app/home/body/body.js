import {loadApps$, requestedApps, runApp$} from 'apps'
import PropTypes from 'prop-types'
import React from 'react'
import {isPathInLocation, location} from 'route'
import {connect} from 'store'
import {msg} from 'translate'
import {CenteredProgress} from 'widget/progress'
import {Select} from 'widget/selectable'
import Account from './account/account'
import AppLaunchPad from './appLaunchPad/appLaunchPad'
import styles from './body.module.css'
import Browse from './browse/browse'
import IFrame from './iframe'
import Process from './process/process'
import Section from './section'
import Tasks from './tasks/tasks'
import Terminal from './terminal/terminal'
import Users from './users/users'

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
        const {action, className} = this.props
        const appSections = this.props.requestedApps.map((app) =>
            <Section key={app.path} path={'/app' + app.path} className={styles.app}>
                <IFrame app={app}/>
            </Section>
        )

        if (!action('LOAD_APPS').dispatched)
            return <CenteredProgress title={msg('body.loading-apps')} className={className}/>
        return (
            <div className={className}>
                <Select className={styles.sections}>
                    <Section path='/process' className={styles.transparent}>
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
    asyncActionBuilder: PropTypes.func,
    action: PropTypes.func,
    className: PropTypes.string,
    location: PropTypes.object,
    requestedApps: PropTypes.array
}

export default connect(mapStateToProps)(Body)