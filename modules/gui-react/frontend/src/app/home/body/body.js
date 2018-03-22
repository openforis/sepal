import React from 'react'
import Dashboard from './dashboard/dashboard'
import Browse from './browse/browse'
import Terminal from './terminal/terminal'
import {connect} from 'store'
import styles from './body.module.css'
import {Select} from 'widget/selectable'
import Process from './process/process'
import Apps, {runningApps} from './apps/apps'
import Tasks from './tasks/tasks'
import Users from './users/users'
import Account from './account/account'
import Section from './section'

const mapStateToProps = () => ({
    runningApps: runningApps()
})

class Body extends React.Component {
    render() {
        const appSections = this.props.runningApps.map((app) =>
            <Section key={app.path} path={'/app' + app.path}>
                <iframe
                    width={'100%'}
                    frameBorder={'0'}
                    src={`/sandbox/${app.path}`}
                    title={app.label}/>
            </Section>
        )

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
                <Section path='/apps'>
                    <Apps/>
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

export default Body = connect(mapStateToProps)(Body)