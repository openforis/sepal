import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {UsageButton} from '../user/usage'
import {UserDetailsButton} from '../user/userDetails'
import {UserMessagesButton} from '../user/userMessages'
import {logout} from 'widget/user'
import {msg} from 'translate'
import React from 'react'
import styles from './footer.module.css'

const Footer = ({className}) => {
    return (
        <div className={className}>
            <div className={styles.footer}>
                <ButtonGroup type='horizontal-tight'>
                    <Title/>
                    <Copyright/>
                </ButtonGroup>
                <div>
                    <ButtonGroup type='horizontal-tight'>
                        <UserMessagesButton/>
                        <UsageButton/>
                        <UserDetailsButton/>
                        <Logout/>
                    </ButtonGroup>
                </div>
            </div>
        </div>
    )
}

Footer.propTypes = {}

const Logout = () =>
    <Button
        chromeless
        look='transparent'
        size='large'
        air='less'
        icon='sign-out-alt'
        onClick={logout}
        tooltip={msg('home.sections.logout')}
        tooltipPlacement='top'/>

const Title = () => {
    const wikiURL = 'https://github.com/openforis/sepal/wiki'
    return (
        <Button
            chromeless
            look='transparent'
            air='less'
            additionalClassName={styles.title}
            linkUrl={wikiURL}
            linkTarget={'sepal-wiki'}
            label='SEPAL'/>
    )
}

const Copyright = () => {
    const thisYear = new Date().getFullYear()
    return <span className={styles.copyright}>&copy;{thisYear}</span>
}

export default Footer
