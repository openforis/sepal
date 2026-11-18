import PropTypes from 'prop-types'

import {formatCatalogDate, removalDate, unavailableReason} from '~/appAvailability'
import {getLanguage, msg} from '~/translate'
import {isServiceAccount} from '~/user'
import {Markdown} from '~/widget/markdown'
import {Message} from '~/widget/message'
import {Panel} from '~/widget/panel/panel'

import styles from './appDetails.module.css'
import {AppItem} from './appItem'

export const AppDetails = props => {
    const {app, onClose} = props
    return (
        <Panel
            className={styles.panel}
            placement='modal'
            onBackdropClick={onClose}>
            <Panel.Header>
                <AppItem app={app}/>
            </Panel.Header>
            <Panel.Content
                scrollable
                className={styles.panelContent}>
                <Availability app={app}/>
                <Markdown source={app.description}/>
                <div className={styles.footer}>
                    {app.author ? <Author app={app}/> : null}
                    {app.releasedOn ? <ReleaseDate app={app}/> : null}
                    {app.projectLink ? <ProjectLink app={app}/> : null}
                </div>
            </Panel.Content>
            <Panel.Buttons>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Close
                        keybinding={['Enter', 'Escape']}
                        onClick={onClose}
                    />
                </Panel.Buttons.Main>
            </Panel.Buttons>
        </Panel>
    )
}

const Availability = ({app}) => {
    switch (unavailableReason(app, {serviceAccount: isServiceAccount()})) {
        case 'retired':
            return <Message className={styles.availability} type='warning' icon='box-archive' text={retirementNotice(app)}/>
        case 'disabled':
            return <Message className={styles.availability} type='warning' icon='triangle-exclamation' text={msg('apps.unavailable.disabled')}/>
        case 'googleAccountRequired':
            return <Message className={styles.availability} type='warning' icon='triangle-exclamation' text={msg('apps.unavailable.googleAccountRequired')}/>
        default:
            return null
    }
}

export const retirementNotice = app => {
    const notice = msg('apps.retired.notice', {
        date: formatCatalogDate(app.retiredOn, getLanguage()),
        removalDate: formatCatalogDate(removalDate(app), getLanguage())
    })
    return app.retirementReason ? `${notice} ${app.retirementReason}` : notice
}

const ReleaseDate = ({app}) => {
    const date = formatCatalogDate(app.releasedOn, getLanguage())
    return date
        ? <div>{msg('apps.releasedOn', {date})}</div>
        : null
}

const Author = ({app}) =>
    <div className={styles.author}>
        {msg('apps.developedBy', {author: app.author})}
    </div>

const ProjectLink = ({app}) =>
    <div className={styles.projectLink}>
        <a href={app.projectLink} rel='noopener noreferrer' target='_blank'>{app.projectLink}</a>
    </div>

AppDetails.propTypes = {
    app: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired
}
