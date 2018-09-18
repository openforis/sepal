import {EMPTY, interval, merge} from 'rxjs'
import {connect} from 'store'
import {currentUser, loadCurrentUser$} from 'user'
import {delay, exhaustMap, map, switchMap} from 'rxjs/operators'
import {isFloating} from './menu/menuMode'
import Body from './body/body'
import Footer from './footer/footer'
import Map from './map/map'
import Menu from './menu/menu'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'
import styles from './home.module.css'

const mapStateToProps = () => ({
    floatingMenu: isFloating(),
    floatingFooter: false,
    user: currentUser()
})

const refreshUserAccessTokens$ = (user) => {
    const oneMinute = 60 * 1000
    const minRefreshTime = oneMinute
    const maxRefreshTime = 20 * oneMinute
    const calculateDelayMillis = (expiryDate) =>
        Math.min(maxRefreshTime, Math.max(minRefreshTime, expiryDate - 5 * oneMinute - Date.now()))
    return interval(0).pipe(
        delay(calculateDelayMillis(user.googleTokens.accessTokenExpiryDate)),
        exhaustMap(() => loadCurrentUser$().pipe(
            map(currentUserAction => {
                // console.log({currentUserAction})
                currentUserAction.dispatch()
                return currentUserAction.user.googleTokens.accessTokenExpiryDate
            }),
            map(calculateDelayMillis),
            switchMap((delayMillis) => EMPTY.pipe(delay(delayMillis))
            )
        ))
    )
}

// const refreshUserReport$ = () =>  {
//     const refreshSeconds = 10
//     const loadCurrentUserReport$ = backend.user.loadCurrentUserReport$()
//     return merge(
//         loadCurrentUserReport$,
//         interval(refreshSeconds * 1000).pipe(
//             exhaustMap(() => loadCurrentUserReport$)
//         )
//     ).pipe(
//         map(currentUserReport =>
//             actionBuilder('UPDATE_CURRENT_USER_REPORT')
//                 .set('user.currentUserReport', currentUserReport)
//                 .dispatch()
//         )
//     )
// }

const updateTasks$ = () => {
    const refreshSeconds = 5
    // const loadAll$ = backend.tasks.loadAll$()
    const loadAll$ = api.tasks.loadAll$()
    return merge(
        loadAll$,
        interval(refreshSeconds * 1000).pipe(
            exhaustMap(() => loadAll$),
        )
    ).pipe(
        map(tasks =>
            actionBuilder('UPDATE_TASKS')
                .set('tasks', tasks)
                .dispatch()
        )
    )
}

class Home extends React.Component {
    UNSAFE_componentWillMount() {
        // this.props.stream('SCHEDULE_USER_REPORT_REFRESH',
        //     refreshUserReport$()
        // )
        this.props.stream('SCHEDULE_UPDATE_TASKS',
            updateTasks$()
        )
        if (this.props.user.googleTokens) {
            this.props.stream('SCHEDULE_USER_INFO_REFRESH',
                refreshUserAccessTokens$(this.props.user)
            )
        }
    }

    render() {
        const {user, floatingMenu, floatingFooter} = this.props
        return (
            <div className={[
                styles.container,
                floatingMenu && styles.floatingMenu,
                floatingFooter && styles.floatingFooter
            ].join(' ')}>
                <Map className={styles.map}/>
                <Menu className={styles.menu} user={user}/>
                <Footer className={styles.footer} user={user}/>
                <Body className={styles.body}/>
            </div>
        )
    }
}

Home.propTypes = {
    floatingFooter: PropTypes.bool.isRequired,
    floatingMenu: PropTypes.bool.isRequired,
    user: PropTypes.object.isRequired
}

export default connect(mapStateToProps)(Home)
