let overlayMapManager = {
  'config': {
        'geeGatewayApiUrl': '',
        'digitalGlobeApiKey': '',
        'dgcsConnectId': '',
        'planetProxyUrl': '',
        'sepalHost': ''
    },
    'overlayMapTypes': {},
    'addOverlayMapType': function(overlay, index, callback) {
        if (this.overlayMapTypes[index] !== undefined) {
            callback();
        }
        var that = this;
        var layerName = overlay.layerName;
        if (overlay.type === 'gee-gateway') {
            var collectionName = overlay.collectionName;
            var bands = '';
            var b1 = overlay.band1;
            var b2 = overlay.band2;
            var b3 = overlay.band3;
            if (b1 !== '' && b2 !== '' && b3 !== '') {
                bands = b1 + ',' + b2 + ',' + b3;
            }
            var visParams = {
                min: overlay.min,
                max: overlay.max,
                bands: bands
            };
            var gamma = overlay.gamma;
            if (gamma !== '') visParams['gamma'] = gamma;
            var palette = overlay.palette;
            if (palette !== '') visParams['palette'] = palette;
            var dateFrom = overlay.dateFrom;
            var dateTo = overlay.dateTo;
            var url = this.config.geeGatewayApiUrl;
            if (collectionName === 'ASTER/AST_L1T_003') {
                url += '/asterMosaic';
            } else if (collectionName === 'NDVI_CHANGE') {
                url += '/ndviChange';
            } else {
                url += '/firstImageByMosaicCollection';
            }
            $.ajax({
                url: url,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    collectionName: collectionName,
                    visParams: visParams,
                    dateFrom: dateFrom,
                    dateTo: dateTo,
                    yearFrom: dateFrom,
                    yearTo: dateTo
                })
            }).done(function(data, textStatus, jqXHR) {
                if (data.errMsg) {
                    console.error(data, textStatus, jqXHR);
                } else {
                    if (data.hasOwnProperty('mapid')) {
                      that.overlayMapTypes[index] = createEarthEngineLayer(data.mapid, data.token);
                    }
                }
                callback();
            });
        } else if (overlay.type === 'geea-gateway') {
            var imageName = overlay.geeaImageName;
            var visParams = {
                min: overlay.geeaMin,
                max: overlay.geeaMax,
                bands: overlay.geeaBands
            };
            var gamma = overlay.geeaGamma;
            if (gamma !== '') visParams['gamma'] = gamma;
            var palette = overlay.geeaPalette;
            if (palette !== '') visParams['palette'] = palette;
            $.ajax({
                url: this.config.geeGatewayApiUrl + '/image',
                type: 'POST',
                contentType: 'application/json',
                async: false,
                data: JSON.stringify({
                    imageName: imageName,
                    visParams: visParams
                })
            }).fail(function(jqXHR, textStatus, errorThrown) {
                console.error(jqXHR, textStatus, errorThrown);
            }).done(function(data, textStatus, jqXHR) {
                if (data.errMsg) {
                    console.error(data, textStatus, jqXHR);
                } else {
                    if (data.hasOwnProperty('mapid')) {
                      that.overlayMapTypes[index] = createEarthEngineLayer(data.mapid, data.token);
                    }
                    callback();
                }
            });
        } else if (overlay.type === 'digitalglobe') {
            var mapId = overlay.mapID;
            var token = this.config.digitalGlobeApiKey;
            var layerOptions = {
                getTileUrl: function (tile, zoom) {
                    var url = 'https://{s}.tiles.mapbox.com/v4/{m}/{z}/{x}/{y}.png?access_token=' + token;
                    return url.replace('{s}', 'api').replace('{m}', mapId).replace('{z}', zoom).replace('{x}', tile.x).replace('{y}', tile.y);
                },
                name: layerName,
                tileSize : new google.maps.Size(256, 256)
            };
            var imageMapType = new google.maps.ImageMapType(layerOptions);
            this.overlayMapTypes[index] = imageMapType;
            callback();
        } else if (overlay.type === 'gibs') {
            var imageryLayer = overlay.imageryLayer;
            var date = overlay.date;
            var layerOptions = {
                alt: layerName,
                getTileUrl: function(tile, zoom) {
                    var url = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{imageryLayer}/default/{date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
                    return url.replace('{imageryLayer}', imageryLayer).replace('{date}', date).replace('{z}', zoom).replace('{x}', tile.x).replace('{y}', tile.y);
                },
                maxZoom: 8,
                minZoom: 1,
                name: layerName,
                tileSize: new google.maps.Size(256, 256)
            };
            var imageMapType = new google.maps.ImageMapType(layerOptions);
            this.overlayMapTypes[index] = imageMapType;
            callback();
        } else if (overlay.type === 'geonetwork') {
            var geonetworkLayer = L.tileLayer.wms('http://data.fao.org/maps/wms?', {
                layers: overlay.geonetworkLayer,
                tiled: true,
                format: 'image/png',
                transparent: true,
                maxZoom: 20,
                minZoom: 0,
                continuousWorld: true,
                version: '1.3.0'
            });
            this.overlayMapTypes[index] = geonetworkLayer;
            callback();
        } else if (overlay.type === 'dgcs') {
            var connectid = this.config.dgcsConnectId;
            var url = 'https://services.digitalglobe.com/mapservice/wmsaccess?';
            url += 'connectid=' + connectid;
            //
            var stackingProfile = overlay.dgcsStackingProfile;
            if (stackingProfile !== undefined) {
                url += '&featureProfile=' + stackingProfile;
            }
            //
            var filters = '';
            if (overlay.dgcsCloudCover !== '') {
                if (filters !== '') filters += 'AND';
                filters += "(cloudCover<" + overlay.dgcsCloudCover + ")";
            }
            if (overlay.dgcsAcquisitionDateFrom !== '') {
                if (filters !== '') filters += 'AND';
                filters += "(acquisitionDate>='" + overlay.dgcsAcquisitionDateFrom + "')";
            }
            if (overlay.dgcsAcquisitionDateTo !== '') {
                if (filters !== '') filters += 'AND';
                filters += "(acquisitionDate<='" + overlay.dgcsAcquisitionDateTo + "')";
            }
            if (overlay.dgcsProductType !== '') {
                if (filters !== '') filters += 'AND';
                filters += "(productType='" + overlay.dgcsProductType + "')";
            }
            if (filters !== '') url += '&COVERAGE_CQL_FILTER=' + filters;
            //
            var dgcsLayer = L.tileLayer.wms(url, {
                layers: 'DigitalGlobe:Imagery',
                format: 'image/png',
                style: 'default',
                transparent: true,
                maxZoom: 20,
                minZoom: 0,
                continuousWorld: true,
                crs: L.CRS.EPSG3857,
                version: '1.1.1'
            });
            this.overlayMapTypes[index] = dgcsLayer;
            callback();
        } else if (overlay.type === 'planet') {
            var mosaic_name = overlay.planetMosaicName;
            var planet_proxy_url = this.config.planetProxyUrl;
            var layerOptions = {
                getTileUrl: function (tile, zoom) {
                    var url = planet_proxy_url + '/{mosaic_name}/{z}/{x}/{y}';
                    return url.replace('{mosaic_name}', mosaic_name).replace('{z}', zoom).replace('{x}', tile.x).replace('{y}', tile.y);
                },
                name: layerName,
                tileSize : new google.maps.Size(256, 256)
            };
            this.overlayMapTypes[index] = new google.maps.ImageMapType(layerOptions);
            callback();
        } else if (overlay.type === 'sepal') {
            $.ajax({
                url: 'https://' + this.config.sepalHost + '/api/processing-recipes/' + overlay.sepalMosaicName,
            }).fail(function(jqXHR, textStatus, errorThrown) {
                console.error(jqXHR, textStatus, errorThrown);
            }).done(function(recipe, textStatus, jqXHR) {
                var type = recipe.type;
                var req = {recipe: recipe};
                if (type === 'MOSAIC') {
                    req.bands = {
                        selection: overlay.sepalBands.split(', '),
                        panSharpen: !!parseInt(overlay.sepalPansharpening)
                    };
                } else if (type === 'CLASSIFICATION') {
                } else if (type === 'CHANGE_DETECTION') {
                }
                $.ajax({
                    url: 'https://' + that.config.sepalHost + '/api/gee/preview',
                    contentType: 'application/json',
                    type: 'POST',
                    data: JSON.stringify(req)
                }).fail(function(jqXHR, textStatus, errorThrown) {
                    console.error(jqXHR, textStatus, errorThrown);
                }).done(function(data, textStatus, jqXHR) {
                    if (data.hasOwnProperty('mapId')) {
                      that.overlayMapTypes[index] = createEarthEngineLayer(data.mapId, data.token);
                    }
                    callback();
                });
            });
        } else if (overlay.type === 'geoserver') {
            var geoserverLayer = L.tileLayer.wms(overlay.geoserverUrl, {
                layers: overlay.geoserverLayers,
                tiled: true,
                format: overlay.geoserverFormat,
                transparent: true,
                maxZoom: 20,
                minZoom: 0,
                continuousWorld: true,
                version: overlay.geoserverVersion
            });
            this.overlayMapTypes[index] = geoserverLayer;
            callback();
        }

        function createEarthEngineLayer(mapId, token) {
          if (document.documentMode) {
            return new ee.MapLayerOverlay('https://earthengine.googleapis.com/map', mapId, token, {});
          } else {
            // Requires Content-Security-Policy, not available in IE
            return new ee.layers.ImageOverlay(
                new ee.layers.EarthEngineTileSource(
                    toMapId(mapId, token)
                )
            )
          }
        }

    }

};




// Creates a ee.data.RawMapId.
// https://github.com/google/earthengine-api/blob/1a3121aa7574ecf2d5432c047621081aed8e1b28/javascript/src/data.js#L2198
const toMapId = (mapid, token) => {
    const path = `https://earthengine.googleapis.com/map/${mapid}`
    const suffix = `?token=${token}`
    // Builds a URL of the form {tileBaseUrl}{path}/{z}/{x}/{y}{suffix}
    const formatTileUrl = (x, y, z) => {
        const width = Math.pow(2, z)
        x = x % width
        if (x < 0) {
            x += width
        }
        return [path, z, x, y].join('/') + suffix
    }
    return {mapid, token, formatTileUrl}
}
