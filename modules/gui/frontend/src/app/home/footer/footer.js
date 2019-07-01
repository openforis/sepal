import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Layout} from 'widget/layout'
import {UsageButton} from '../user/usage'
import {UserDetailsButton} from '../user/userDetails'
import {UserMessagesButton} from '../user/userMessages'
import {logout} from 'widget/user'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import React from 'react'
import clipboard from 'clipboard'
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
    const buildNumber = process.env.REACT_APP_BUILD_NUMBER
    const gitCommit = process.env.REACT_APP_GIT_COMMIT
    const gitShortCommit = gitCommit && `${gitCommit.substring(0, 10)}...`

    const copyToClipboard = (value, message) => {
        clipboard.copy(value)
        Notifications.success({message})
    }
    
    const tooltip =
        <Layout type='vertical' spacing='none'>
            <Layout type='horizontal-nowrap'>
                <div>{msg('footer.buildNumber')}</div>
                <ButtonGroup type='horizontal-tight'>
                    <Button
                        chromeless
                        shape='pill'
                        linkUrl={`http://ops.sepal.io:8080/job/Sepal/${buildNumber}/`}
                        linkTarget='jenkins'
                        disabled={!buildNumber}
                        label={buildNumber || '?'}
                    />
                    <Button
                        chromeless
                        shape='circle'
                        icon='copy'
                        disabled={!buildNumber}
                        onClick={() =>
                            copyToClipboard(buildNumber, msg('footer.buildNumberCopied'))
                        }
                    />
                </ButtonGroup>
            </Layout>
            <Layout type='horizontal-nowrap'>
                <div>{msg('footer.gitCommit')}</div>
                <ButtonGroup type='horizontal-tight'>
                    <Button
                        chromeless
                        shape='pill'
                        linkUrl={`https://github.com/openforis/sepal/tree/${gitCommit}`}
                        linkTarget='github'
                        disabled={!gitCommit}
                        label={gitShortCommit || '?'}
                    />
                    <Button
                        chromeless
                        shape='circle'
                        icon='copy'
                        disabled={!gitCommit}
                        onClick={() =>
                            copyToClipboard(gitCommit, msg('footer.gitCommitCopied'))
                        }
                    />
                </ButtonGroup>
            </Layout>
        </Layout>

    return (
        <Button
            chromeless
            look='transparent'
            air='less'
            additionalClassName={styles.title}
            linkUrl={wikiURL}
            linkTarget={'sepal-wiki'}
            label='SEPAL'
            tooltip={tooltip}/>
    )
}

const Copyright = () => {
    const thisYear = new Date().getFullYear()
    return <span className={styles.copyright}>&copy;{thisYear}</span>
}

export default Footer
