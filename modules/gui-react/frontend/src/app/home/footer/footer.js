import {logout} from 'user'
import {msg} from 'translate'
import Icon from 'widget/icon'
import MenuMode from '../menu/menuMode'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import UserProfile from '../user/userProfile'
import UserReport from '../user/userReport'
import styles from './footer.module.css'

const Footer = ({className}) => {
    return (
        <div className={className}>
            <div className={styles.footer}>
                <div>
                    <MenuMode/>
                </div>
                <div>
                    <Title/>
                    <Copyright/>
                </div>
                <div>
                    <UserReport className={styles.user}/>
                    <UserProfile className={styles.user}/>
                    <Logout/>
                </div>
            </div>
        </div>
    )
}

Footer.propTypes = {
    className: PropTypes.string,
    user: PropTypes.object
}

const Logout = () =>
    <Tooltip msg={msg('home.sections.logout.tooltip')} top>
        <button className={styles.logout} onClick={logout}>
            <Icon name={'sign-out-alt'}/>
        </button>
    </Tooltip>

const Title = () => {
    const wikiURL = 'https://github.com/openforis/sepal/wiki'
    return (
        <a href={wikiURL} className={styles.title} target={'sepal-wiki'}>
            Sepal
        </a>
    )
}

const Copyright = () => {
    const thisYear = new Date().getFullYear()
    return <span className={styles.copyright}>&copy;{thisYear}</span>
}

export default Footer
