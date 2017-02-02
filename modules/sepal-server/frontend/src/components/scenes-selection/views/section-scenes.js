/**
 * @author Mino Togna
 */
var numeral = require( 'numeral' )

var moment  = require( 'moment' )
var Sensors = require( '../../sensors/sensors' )

var EventBus  = require( '../../event/event-bus' )
var Events    = require( '../../event/events' )
var Animation = require( '../../animation/animation' )

var section              = null
var sectionImages        = null
var sectionImage         = null
var sectionExpandedImage = null

var currentSceneAreaId = null

var init = function ( container ) {
    section = container
    
    sectionImages        = section.find( '.images-section' )
    sectionImage         = section.find( '.image-section' )
    sectionExpandedImage = section.find( '.expanded-image-section' )
}

var reset = function ( sceneAreaId ) {
    if ( section ) {
        sectionImages.empty()
        sectionImages.velocity( 'scroll', { duration: 0 } )
    }
    
    currentSceneAreaId = sceneAreaId
}

var add = function ( sceneImage, filterHidden, selected ) {
    var imgSection = getImageSection( sceneImage )
    
    
    if ( filterHidden ) {
        imgSection.addClass( 'filter-hidden' )
        imgSection.hide( 0 )
    } else if ( selected ) {
        imgSection.addClass( 'selected' )
        imgSection.hide( 0 )
    } else {
        imgSection.show( 0 )
    }
}

var getImageSection = function ( sceneImage ) {
    var imgSection = sectionImage.clone()
    imgSection.addClass( sceneImage.sceneId )
    imgSection.addClass( 'sensor-' + sceneImage.sensor )
    
    var img = imgSection.find( 'img' )
    img.attr( 'src', sceneImage.browseUrl )
    
    var imgHover = imgSection.find( '.img-hover' )
    img.mouseenter( function () {
        imgHover.stop().fadeIn( 150 )
        img.velocity( { opacity: 0.5 }, { duration: 150 } )
    } )
    imgHover.mouseleave( function () {
        imgHover.stop().fadeOut( 150 )
        img.velocity( { opacity: 1 }, { duration: 150 } )
    } )
    
    imgHover.click( function () {
        previewScene( null, sceneImage )
    } )
    
    imgSection.find( '.cloud-cover' ).append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + numeral( sceneImage.cloudCover ).format( '0.[00]' ) )
    imgSection.find( '.sensor' ).append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + Sensors[ sceneImage.sensor ].shortName )
    imgSection.find( '.acquisition-date' ).append( '<i class="fa fa-calendar" aria-hidden="true"></i> ' + moment( sceneImage.acquisitionDate, "YYYY-MM-DD" ).format( "YYYY" ) )
    imgSection.find( '.target-day' ).append( '<i class="fa fa-calendar-times-o" aria-hidden="true"></i> ' + sceneImage.daysFromTargetDay )
    
    imgSection.find( '.btn-add' ).click( function () {
        EventBus.dispatch( Events.SECTION.SCENES_SELECTION.SELECT, null, currentSceneAreaId, sceneImage )
    } )
    sectionImages.append( imgSection )
    
    return imgSection
}

var hideScene = function ( sceneImage ) {
    var imgSection = sectionImages.find( '.' + sceneImage.sceneId )
    imgSection.addClass( 'selected' )
    
    Animation.animateOut( imgSection )
}

var showScene = function ( sceneImage ) {
    var imgSection = sectionImages.find( '.' + sceneImage.sceneId )
    imgSection.removeClass( 'selected' )
    
    if ( !imgSection.hasClass( 'filter-hidden' ) ) {
        imgSection.velocity( 'scroll', {
            container : sectionImages
            , duration: 600
            , delay   : 100
        } )
        
        Animation.animateIn( imgSection )
    }
}

var hideScenesBySensor = function ( sensor ) {
    var scenes = sectionImages.find( '.sensor-' + sensor )
    scenes.addClass( 'filter-hidden' )
    
    scenes = scenes.not( '.selected' )
    scenes.fadeOut( 300 )
}

var showScenesBySensor = function ( sensor ) {
    var scenes = sectionImages.find( '.sensor-' + sensor )
    scenes.removeClass( 'filter-hidden' )
    
    scenes = scenes.not( '.selected' )
    $.each( scenes, function ( i, scene ) {
        scene = $( scene )
        setTimeout( function () {
            scene.show( 0 )
        }, i * 50 )
    } )
}

var previewScene = function ( evt, sceneImage ) {
    sectionExpandedImage.find( 'img' ).attr( 'src', sceneImage.browseUrl ).click( function () {
        Animation.animateOut( sectionExpandedImage )
    } )
    sectionExpandedImage.find( '.scene-id' ).empty().append( sceneImage.sceneId )
    sectionExpandedImage.find( '.cloud-cover' ).empty().append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + sceneImage.cloudCover )
    sectionExpandedImage.find( '.sensor' ).empty().append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + Sensors[ sceneImage.sensor ].name )
    sectionExpandedImage.find( '.acquisition-date' ).empty().append( '<i class="fa fa-calendar" aria-hidden="true"></i> ' + sceneImage.acquisitionDate )
    sectionExpandedImage.find( '.target-day' ).empty().append( '<i class="fa fa-calendar-times-o" aria-hidden="true"></i> ' + sceneImage.daysFromTargetDay )
    sectionExpandedImage.find( '.sun-azimuth' ).empty()
        .append( '<span class="fa-stack"><i class="fa fa-sun-o fa-stack-2x" aria-hidden="true"></i><i class="fa fa-ellipsis-h fa-stack-1x" aria-hidden="true"></i></span> ' + sceneImage.sunAzimuth.toFixed( 2 ) )
    sectionExpandedImage.find( '.sun-elevation' ).empty()
        .append( '<span class="fa-stack"><i class="fa fa-sun-o fa-stack-2x" aria-hidden="true"></i><i class="fa fa-ellipsis-v fa-stack-1x" aria-hidden="true"></i></span> ' + sceneImage.sunElevation.toFixed( 2 ) )
    
    Animation.animateIn( sectionExpandedImage )
}

EventBus.addEventListener( Events.SECTION.SCENES_SELECTION.PREVIEW_SCENE, previewScene )

module.exports = {
    init                : init
    , reset             : reset
    , add               : add
    , hideScenesBySensor: hideScenesBySensor
    , showScenesBySensor: showScenesBySensor
    , hideScene         : hideScene
    , showScene         : showScene
}