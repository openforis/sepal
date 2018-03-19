import React from 'react'
import styles from './dashboard.module.css'

export default class Dashboard extends React.Component {
    componentWillMount() {
        console.log('Dashboard: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Dashboard: componentWillUnmount')
    }

    render() {
        return (
            <div className={styles.container}>
                <h1>Dashboard</h1>
            </div>
        )
    }
}