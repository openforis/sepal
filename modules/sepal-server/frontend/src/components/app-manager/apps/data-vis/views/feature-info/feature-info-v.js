/**
 * @author Mino Togna
 */
require( './feature-info.scss' )


var container       = null
var loader          = null
var layersContainer = null

var rowRaster = null
var rowShape  = null

var init = function ( c ) {
    var template = require( './feature-info.html' )
    var html     = $( template( {} ) )
    container    = $( c )
    container.append( html )
    
    loader          = container.find( '.row-loader' )
    layersContainer = container.find( '.layers-info-container' )
    rowRaster       = container.find( '.row-raster' )
    rowShape        = container.find( '.row-shape' )
    
    var btnClose = container.find( '.btn-close-feature-info' )
    btnClose.click( function ( e ) {
        close()
    } )
}

var show = function () {
    container.velocity( { right: '0' } )
}

var close = function () {
    container.velocity( { right: '-35%' } )
}

var reset = function () {
    layersContainer.empty()
    loader.show()
}

var hideLoader = function () {
    loader.hide()
}


var add = function ( layer, featureInfo ) {
    console.log( "==== adding feature info" )
    console.log( layer )
    console.log( featureInfo )
    
    if ( layer.type == 'raster' ) {
        addRaster( layer, featureInfo )
    } else {
        addShape( layer, featureInfo )
    }
}

var addRaster = function ( layer, featureInfo ) {
    var row = rowRaster.clone()
    row.addClass( 'layer-info layer-info-' + layer.id )
    layersContainer.append( row )
    
    var name = layer.path
    if ( name.indexOf( '/' ) >= 0 ) {
        name = name.slice( name.lastIndexOf( '/' ) + 1 )
    }
    row.find( '.name' ).html( name )
    
    var btnToggle = row.find( '.btn-toggle-layer-info' )
    btnToggle.click( function () {
        var rowValues = row.find( '.row-values' )
        if ( rowValues.is( ":visible" ) ) {
            rowValues.velocitySlideUp()
            btnToggle.find( 'i' ).removeClass().addClass( "fa fa-chevron-circle-right" )
        } else {
            rowValues.velocitySlideDown( { display: 'flex' } )
            btnToggle.find( 'i' ).removeClass().addClass( "fa fa-chevron-circle-down" )
        }
    } )
    
    toggleInfo( layer )
    
    $.each( featureInfo, function ( i, value ) {
        var colValue = $( '<div class="col-sm-4"/>' )
        colValue.html( value )
        row.find( '.row-values' ).append( colValue )
    } )
    
}

var addShape = function ( layer, featureInfo ) {
    
}

var toggleInfo = function ( layer ) {
    var row = layersContainer.find( '.layer-info-' + layer.id )
    if ( layer.visible ) {
        row.fadeIn()
    } else {
        row.fadeOut()
    }
}

var deleteInfo = function ( layerId ) {
    var row = layersContainer.find( '.layer-info-' + layerId )
    row.fadeOut( {
        complete: function () {
            row.remove()
            if ( layersContainer.find( '.layer-info' ).length <= 0 )
                close()
        }
    } )
}

module.exports = {
    init        : init
    , show      : show
    , hideLoader: hideLoader
    , reset     : reset
    , add       : add
    , toggleInfo: toggleInfo
    , deleteInfo: deleteInfo
}