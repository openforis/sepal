// import PropTypes from 'prop-types'
import {useEffect} from 'react'
import {useSelector} from 'react-redux'
import {useLocation, useNavigate} from 'react-router-dom'

import {Maps} from '~/app/home/map/maps'
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

export const Body = ({className}) => {
    const location = useLocation()
    const navigate = useNavigate()
    const budgetExceeded = useSelector(() => select('user.budgetExceeded'))

    useEffect(() => {
        const oldProcessPath = location.pathname === '/-/process'
        const allowedWhenBudgetExceeded = ['/', '/-/browse', '/-/users'].includes(location.pathname)
        if (oldProcessPath || (budgetExceeded && !allowedWhenBudgetExceeded)) {
            navigate('/')
        }
    }, [])

    const renderSections = () => (
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

    const renderProgress = () =>
        <CenteredProgress title={msg('body.starting-sepal')} className={className}/>

    return (
        <Maps onError={() => Notifications.error({message: msg('body.starting-sepal-failed'), timeout: -1})}>
            {(initialized, error) => error
                ? null
                : initialized
                    ? renderSections()
                    : renderProgress()
            }
        </Maps>
    )
}
