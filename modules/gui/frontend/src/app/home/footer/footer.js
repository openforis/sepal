import {Button, ButtonGroup} from 'widget/button'
import {logout} from 'user'
import {msg} from 'translate'
import MenuMode from '../menu/menuMode'
import PropTypes from 'prop-types'
import React from 'react'
import UserMessages from '../user/userMessages'
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
                    <ButtonGroup compact>
                        <UserMessages/>
                        <UserReport/>
                        <UserProfile/>
                        <Logout/>
                    </ButtonGroup>
                </div>
            </div>
        </div>
    )
}

Footer.propTypes = {
    user: PropTypes.object
}

const Logout = () =>
    <Button
        chromeless
        look='transparent'
        size='large'
        icon='sign-out-alt'
        onClick={logout}
        tooltip={msg('home.sections.logout')}
        tooltipPlacement='top'/>

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
