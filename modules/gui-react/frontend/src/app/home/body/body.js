import React from 'react'
import {location} from 'route'
import Dashboard from './dashboard/dashboard'
import Browse from './browse/browse'
import Terminal from './terminal/terminal'
import {connect} from 'react-redux'
import styles from './body.module.css'
import Selectable from 'widget/selectable'

export default class Body extends React.Component {
    render() {
        return (
            <div className={styles.sections}>
                <Section path='/dashboard'>
                    <Dashboard/>
                </Section>
                <Section path='/browse'>
                    <Browse/>
                </Section>
                <Section path='/terminal'>
                    <Terminal/>
                </Section>
            </div>
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

// Need to know which section is currently selected, to know what direction to navigate to
// Component state, or redux state?
