import React from 'react'
import {select} from 'store'
import CenteredPanel from 'widget/centered-panel'
import {connect} from 'react-redux'
import actionBuilder from 'action-builder'
import styles from './errors.module.css'

const mapStateToProps = (state) => ({error: state.error})

const reload = () => window.location.reload()

let Error = ({message}) => {
    if (message)
        return (
            <CenteredPanel className={styles.errorPanel}>
                <div>
                    <p>
                        {message}
                    </p>
                    <button onClick={reload}>Reload</button>
                </div>
            </CenteredPanel>
        )
    else
        return null
}

export default Error = connect(mapStateToProps)(Error)

export const error = () => select('error')

export const setError = (message) => actionBuilder('ERROR')
    .push('error', message)
    .build()

export const toMessage = (error) => {
    console.log(error)
    switch (error.status) {
        case 0:
            return 'Failed to connect to Sepal. ' +
                'Either your internet connection failed, or Sepal is unavailable at the moment.'
        default:
            return 'Sepal responded with an error. Please try again.'
    }

}