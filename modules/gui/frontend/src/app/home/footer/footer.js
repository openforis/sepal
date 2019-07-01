import React from 'react'
import {msg} from 'translate'
import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import Tooltip from 'widget/tooltip'
import {logout} from 'widget/user'
import {UsageButton} from '../user/usage'
import {UserDetailsButton} from '../user/userDetails'
import {UserMessagesButton} from '../user/userMessages'
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
    const gitCommit = process.env.REACT_APP_GIT_COMMIT || '?'
    const buildNumber = process.env.REACT_APP_BUILD_NUMBER || '?'
    const tooltip =
        <React.Fragment>
            <div>
                Build number:&nbsp;
                <a href={`http://ops.sepal.io:8080/job/Sepal/${buildNumber}/`} target='jenkins'>{buildNumber}</a>
            </div>
            <div>
                <a href={`https://github.com/openforis/sepal/tree/${gitCommit}`} target='github'>
                    {gitCommit}
                </a>
            </div>
        </React.Fragment>
    return (
        <Tooltip msg={tooltip} top>
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
