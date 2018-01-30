import React from 'react'
import $ from "jquery"
import bg01 from './bg-01.jpg'
import bg02 from './bg-02.jpg'
// import 'velocity-animate/velocity'
// import 'velocity-animate/velocity-ui'
// import './kenburnsy.js'
// import './kenburnsy.css'

console.log(foo)

export default class Slideshow extends React.Component {
  render() {
    return (
      <div className='site-bg-img'/>
    )
  }

  componentDidMount() {
    const bgImg = $('.site-bg-img');
    let img = $('<img src="' + bg01 + '"/>');
    bgImg.append(img)
    img = $('<img src="' + bg02 + '"/>')
    bgImg.append(img)
    bgImg.kenburnsy({
      fullscreen: true,
      duration: 5000,
      fadeInDuration: 1500
    })

  }
}crea