import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import Body from './body/body'
import Footer from './footer/footer'
import styles from './home.module.css'
import Map from './map/map'
import NavBar, {isNavBarFloating} from './navBar/navBar'

const mapStateToProps = () => ({
    navBarFloating: isNavBarFloating()
})

const Home = ({user, navBarFloating}) => {
    return (
        <div className={styles.homeContainer}>
            <Map className={styles.map}/>
            <div className={[styles.home, navBarFloating && styles.navBarFloating].join(' ')}>
                <NavBar className={styles.navBar}/>
                <Footer className={styles.footer} user={user}/>
                <Body className={styles.body}/>
            </div>
        </div>
    )
}

Home.propTypes = {
    user: PropTypes.object.isRequired,
    navBarFloating: PropTypes.bool.isRequired
}

export default connect(mapStateToProps)(Home)
