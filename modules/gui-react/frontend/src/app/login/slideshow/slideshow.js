import React from 'react'
import background1 from './background1.jpg'
import background2 from './background2.jpg'
import styles from './slideshow.module.css'
import './kenburnsy.css'

const $ = require('jquery')
window.jQuery = $
require('velocity-animate')
require('./kenburnsy')

export default class Slideshow extends React.Component {
  render() {
    return (
      <div className={styles.slideshow}>
        <div className='images'/>
        <div className={styles.overlay}/>
      </div>
    )
  }

  componentDidMount() {
    const images = $('.images');
    images.append($('<img src="' + background1 + '"/>'))
    images.append($('<img src="' + background2 + '"/>'))
    images.kenburnsy({
      fullscreen: true,
      duration: 5000,
      fadeInDuration: 1500
    })
  }
}