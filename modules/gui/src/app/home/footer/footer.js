import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Layout} from '~/widget/layout'
import {UsageButton} from '../user/usage'
import {UserDetailsButton} from '../user/userDetails'
import {UserMessagesButton} from '../user/userMessages'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {copyToClipboard} from '~/clipboard'
import {logout$} from '~/user'
import {msg} from '~/translate'
import React from 'react'
import styles from './footer.module.css'

export const Footer = ({className}) => {
    return (
        <div className={className}>
            <div className={styles.footer}>
                <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
                    <Title/>
                    <Copyright/>
                </ButtonGroup>
                <div>
                    <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
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

const _Logout = ({stream}) => {
    const logout = () => stream('LOGOUT', logout$())
    return (
        <Button
            chromeless
            look='transparent'
            size='large'
            air='less'
            icon='sign-out-alt'
            tooltip={msg('home.sections.logout')}
            tooltipPlacement='top'
            onClick={logout}
        />
    )
}

const Logout = compose(
    _Logout,
    connect()
)

const Title = () => {
    const wikiURL = 'https://github.com/openforis/sepal'
    const buildNumber = window._sepal_global_.buildNumber
    const gitCommit = window._sepal_global_.gitCommit
    const gitShortCommit = gitCommit && `${gitCommit.substring(0, 10)}...`

    const copyBuildNumber = () =>
        copyToClipboard(buildNumber, msg('footer.buildNumberCopied'))

    const copyGitCommit = () =>
        copyToClipboard(gitCommit, msg('footer.gitCommitCopied'))

    const tooltip =
        <Layout type='vertical' spacing='none'>
            <Layout type='horizontal-nowrap'>
                <div>{msg('footer.buildNumber')}</div>
                <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
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
                        onClick={copyBuildNumber}
                    />
                </ButtonGroup>
            </Layout>
            <Layout type='horizontal-nowrap'>
                <div>{msg('footer.gitCommit')}</div>
                <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
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
                        onClick={copyGitCommit}
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
            linkTarget='sepal-wiki'
            label='SEPAL'
            tooltip={tooltip}/>
    )
}

const Copyright = () => {
    const thisYear = new Date().getFullYear()
    return <span className={styles.copyright}>&copy;{thisYear}</span>
}

