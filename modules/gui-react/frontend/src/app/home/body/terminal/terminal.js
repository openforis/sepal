import React from 'react'
import styles from './terminal.module.css'

export default class Terminal extends React.Component {
    componentWillMount() {
        console.log('Terminal: componentWillMount')
    }

    componentWillUnmount() {
        console.log('Terminal: componentWillUnmount')
    }

    render() {
        return (
            <div className={styles.container}>
                <h1>Terminal</h1>
            </div>
        )
    }
}