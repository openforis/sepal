import PropTypes from 'prop-types'
import React from 'react'

import {Maps} from '~/app/home/map/maps'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {history, location} from '~/route'
import {select} from '~/store'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'
import {CenteredProgress} from '~/widget/progress'

import {StaticMap} from '../map/staticMap'
import {Apps} from './apps/apps'
import styles from './body.module.css'
import {Browse} from './browse/browse'
import {Process} from './process/process'
import {Section} from './section'
import {Tasks} from './tasks/tasks'
import {Terminal} from './terminal/terminal'
import {Users} from './users/users'

const mapStateToProps = () => ({
    location: location(),
    budgetExceeded: select('user.budgetExceeded'),
})

class _Body extends React.Component {
    componentDidUpdate() {
        const {budgetExceeded, location} = this.props
        const oldProcessPath = this.props.location.pathname === '/-/process'
        const allowedWhenBudgetExceeded = ['/', '/-/browse', '/-/users'].includes(location.pathname)
        if (oldProcessPath || (budgetExceeded && !allowedWhenBudgetExceeded)) {
            history().replace('/')
        }
    }

    renderSections() {
        const {className} = this.props
        return (
            <div className={className}>
                <div className={styles.sections}>
                    <StaticMap/>
                    <Section path='/'>
                        <Process/>
                    </Section>
                    <Section path='/-/browse'>
                        <Browse/>
                    </Section>
                    <Section path='/-/app-launch-pad'>
                        <Apps/>
                    </Section>
                    <Section path='/-/terminal'>
                        <Terminal/>
                    </Section>
                    <Section path='/-/tasks'>
                        <Tasks/>
                    </Section>
                    <Section path='/-/users'>
                        <Users/>
                    </Section>
                </div>
            </div>
        )
    }

    renderProgress() {
        const {className} = this.props
        return <CenteredProgress title={msg('body.starting-sepal')} className={className}/>
    }

    render() {
        return (
            <Maps onError={() => Notifications.error({message: msg('body.starting-sepal-failed'), timeout: -1})}>
                {(initialized, error) => error
                    ? null
                    : initialized
                        ? this.renderSections()
                        : this.renderProgress()
                }
            </Maps>
        )
    }
}

export const Body = compose(
    _Body,
    connect(mapStateToProps)
)

Body.propTypes = {
    className: PropTypes.string,
    location: PropTypes.object
}
