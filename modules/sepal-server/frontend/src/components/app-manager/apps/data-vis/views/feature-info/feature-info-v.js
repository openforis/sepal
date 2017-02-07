/**
 * @author Mino Togna
 */
require( './feature-info.scss' )

var container       = null
var loader          = null
var layersContainer = null
var rowLayerInfo    = null

var init = function ( c ) {
    var template = require( './feature-info.html' )
    var html     = $( template( {} ) )
    container    = $( c )
    container.append( html )
    
    loader          = container.find( '.row-loader' )
    layersContainer = container.find( '.layers-info-container' )
    rowLayerInfo    = container.find( '.layer-info' )
    
    var btnClose = container.find( '.btn-close-feature-info' )
    btnClose.click( function ( e ) {
        close()
    } )
}

var show = function () {
    container.velocity( { right: '1%' } )
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
    var row = addLayerInfo( layer, featureInfo )
    
    if ( layer.type == 'raster' ) {
        addRasterInfo( featureInfo, row )
    } else {
        addShapeInfo( featureInfo, row )
    }
}


var addLayerInfo = function ( layer, featureInfo ) {
    var row = rowLayerInfo.clone()
    row.addClass( 'layer-info-' + layer.id )
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
    
    return row
}

var toggleInfo = function ( layer ) {
    var row = layersContainer.find( '.layer-info-' + layer.id )
    if ( layer.visible ) {
        row.fadeIn()
    } else {
        row.fadeOut()
    }
}

var addRasterInfo = function ( featureInfo, row ) {
    var colValues = row.find( '.col-values' )
    var table     = $( '<div class="row raster-table"/>' )
    colValues.append( table )
    
    $.each( featureInfo, function ( i, value ) {
        var colValue = $( '<div class="col-sm-4 raster-value"/>' )
        colValue.append( $( '<div>' + value + '</div>' ) )
        table.append( colValue )
    } )
}

var addShapeInfo = function ( featureInfo, row ) {
    var colValues = row.find( '.col-values' )
    
    $.each( featureInfo, function ( i, obj ) {
        var table = $( '<div class="row shape-table"/>' )
        colValues.append( table )
        
        $.each( Object.keys( obj ), function ( i, key ) {
            var value = obj[ key ]
            table.append( $( '<div class="col-xs-6 text-align-right">' + key + ': </div>' ) )
            table.append( $( '<div class="col-xs-6 text-align-left">' + value + '</div>' ) )
        } )
    } )
    
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