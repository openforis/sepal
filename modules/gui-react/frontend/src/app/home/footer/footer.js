import React from 'react'
import styles from './footer.module.css'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import Tooltip from 'widget/tooltip'
import {info, logout} from 'user'
import UserProfile from '../user/userProfile'
import MenuMode from '../menu/menuMode'

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
                    <HourlyCost/>
                    <UserProfile className={styles.user}/>
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

const HourlyCost = () =>
    <Tooltip msg='home.sections.user.info'>
        <button className={styles.hourlyCost} onClick={info}>
            <Icon name='dollar-sign'/> 0/h
        </button>
    </Tooltip>

export default Footer
