import React from 'react'
import styles from './browse.module.css'

export default class Browse extends React.Component {
    componentWillMount() {
        console.log('Browse: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Browse: componentWillUnmount')
    }

    render() {
        return (
            <div className={styles.container}>
                <h1>Browse</h1>
            </div>
        )
    }
}