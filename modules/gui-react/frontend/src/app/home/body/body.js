import React from 'react'
import {location} from 'route'
import Dashboard from './dashboard/dashboard'
import Browse from './browse/browse'
import Terminal from './terminal/terminal'
import {connect} from 'react-redux'
import styles from './body.module.css'
import {Select, Selectable} from 'widget/selectable'
import Process from './process/process'
import Apps from './apps/apps'
import Tasks from './tasks/tasks'
import Users from './users/users'
import Account from './account/account'

export default class Body extends React.Component {
    render() {
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
            </Select>
        )
    }
}

const mapStateToProps = () => ({
    location: location()
})

let Section = ({location, path, children}) =>
    <Selectable
        active={inPath(location, path)}
        classNames={{
            default: styles.section,
            in: styles.in,
            out: styles.out,
        }}>
        {children}
    </Selectable>
Section = connect(mapStateToProps)(Section)

function inPath(location, path) {
    return location.pathname === path
}
