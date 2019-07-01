import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import Tooltip from 'widget/tooltip'
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
                <div>
                    <Title/>
                    <Copyright/>
                </div>
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
        icon='sign-out-alt'
        onClick={logout}
        tooltip={msg('home.sections.logout')}
        tooltipPlacement='top'/>

const Title = () => {
    const wikiURL = 'https://github.com/openforis/sepal/wiki'
    return (
        <Tooltip
            msg={`
                    Git commit: ${process.env.REACT_APP_GIT_COMMIT || '?'},
                    Build number: ${process.env.REACT_APP_BUILD_NUMBER || '?'}`}
            top>
            <a href={wikiURL} className={styles.title} target={'sepal-wiki'}>
                Sepal
            </a>
        </Tooltip>
    )
}

const Copyright = () => {
    const thisYear = new Date().getFullYear()
    return <span className={styles.copyright}>&copy;{thisYear}</span>
}

export default Footer
