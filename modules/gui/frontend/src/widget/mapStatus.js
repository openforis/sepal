import PropTypes from 'prop-types'
import React from 'react'
import Icon from 'widget/icon'
import styles from './mapStatus.module.css'

export default class MapStatus extends React.Component {
    state = {}

    render() {
        const {loading = true, message, error} = this.props
        return message || error
            ? (
                <div className={styles.container}>
                    <div className={styles.status}>
                        {loading ? <Icon name='spinner'/> : null}
                        {message ? <div>{message}</div> : null}
                        {error ? <div className={styles.error}>{error}</div> : null}
                    </div>
                </div>
            ) : null
    }
}

MapStatus.propTypes = {
    error: PropTypes.any,
    loading: PropTypes.any,
    message: PropTypes.string
}
