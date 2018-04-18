import React from 'react'
import styles from './footer.module.css'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import Tooltip from 'widget/tooltip'
import {logout} from 'user'

const Footer = ({className, user}) => {
    return (
        <div className={className}>
            <div className={styles.footer}>
                <HourlyCost/>
                <div>
                <a
                    href={'https://github.com/openforis/sepal/wiki'}
                    target={'wiki'}
                    className={styles.sepal}>
                    Sepal
                </a>
                <Copyright/>
                </div>
                <div>
                    <User user={user}/>
                    <Logout/>
                </div>
            </div>
        </div>
    )
}

Footer.propTypes = {
    user: PropTypes.object,
    className: PropTypes.string
}

const Logout = () =>
    <Tooltip msg='home.sections.logout' top>
        <button className={styles.logout} onClick={logout}>
            <Icon name={'sign-out-alt'}/>
        </button>
    </Tooltip>

const User = ({user}) =>
    <button className={styles.user}>
        {user.username}
    </button>

User.propTypes = {
    user: PropTypes.object
}

const Copyright = () => {
    const thisYear = new Date().getFullYear()
    return <span className={styles.copyright}>&copy;{thisYear}</span>
}

const HourlyCost = () =>
    <div className={styles.hourlyCost}>
        <Icon name='dollar-sign'/> 0/h
    </div>

export default Footer
