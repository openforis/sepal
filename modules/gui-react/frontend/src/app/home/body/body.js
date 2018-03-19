import React from 'react'
import {location} from 'route'
import Dashboard from './dashboard/dashboard'
import Browse from './browse/browse'
import Terminal from './terminal/terminal'
import {connect} from 'react-redux'
import styles from './body.module.css'

export default class Body extends React.Component {
    render() {
        return (
            <div className={styles.container}>
                <div className={styles.sections}>
                    <Section path='/dashboard' index={0}>
                        <Dashboard/>
                    </Section>
                    <Section path='/browse' index={2}>
                        <Browse/>
                    </Section>
                    <Section path='/terminal' index={4}>
                        <Terminal/>
                    </Section>
                </div>
            </div>
        )
    }
}

const mapStateToProps = () => ({
    location: location()
})

let Section = ({location, path, index, children}) =>
    <div className={inPath(location, path) ? styles.selected : styles.unselected}>
        {children}
    </div>
Section = connect(mapStateToProps)(Section)

function inPath(location, path) {
    return location.pathname === path
}

// Need to know which section is currently selected, to know what direction to navigate to
// Component state, or redux state?