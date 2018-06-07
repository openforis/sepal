import json, hashlib, zlib, io, csv, time, binascii, datetime

from functools import wraps

from flask import session, request, render_template

def import_sepal_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        sepalUser = request.headers.get('sepal-user')
        if not sepalUser:
            return render_template('401.html'), 401
        try:
            user = json.loads(sepalUser)
        except:
            return render_template('400.html'), 400
        session['username'] = user.get('username')
        session['roles'] = user.get('roles')
        session['is_admin'] = user.get('admin', False)
        session['accessToken'] = user.get('googleTokens').get('accessToken') if user.get('googleTokens') else None
        return f(*args, **kwargs)
    return wrapper

def requires_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get('username'):
            return render_template('401.html'), 401
        return f(*args, **kwargs)
    return wrapper

def requires_role(*role):
    def wrapper(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            if session.get('roles') and role[0] in session.get('roles'):
                return f(*args, **kwargs)
            else:
                return render_template('401.html'), 401
        return wrapped
    return wrapper





from osgeo import gdal,ogr
from osgeo.gdalconst import *
import struct

def timeseries(filename, lon, lat):
    ds = gdal.Open(filename, GA_ReadOnly)
    transf = ds.GetGeoTransform()
    transfInv = gdal.InvGeoTransform(transf)
    px, py = gdal.ApplyGeoTransform(transfInv, lon, lat)

    def pt2fmt(pt):
        fmttypes = {
            GDT_Byte: 'B',
            GDT_Int16: 'h',
            GDT_UInt16: 'H',
            GDT_Int32: 'i',
            GDT_UInt32: 'I',
            GDT_Float32: 'f',
            GDT_Float64: 'f'
            }
        return fmttypes.get(pt, 'x')

    epoch = datetime.datetime.utcfromtimestamp(0)

    bands = ds.RasterCount #1
    timeseries = []
    for i in range(1, bands):
        band = ds.GetRasterBand(i)
        structval = band.ReadRaster(int(px), int(py), 1,1, buf_type = band.DataType )
        fmt = pt2fmt(band.DataType)
        intval = struct.unpack(fmt , structval)
        date = band.GetMetadata()["DATE"]
        date = datetime.datetime.strptime(date, '%Y%m%d')
        date = (date - epoch).total_seconds() * 1000.0
        value =  round(intval[0], 2)
        timeseries.append((date, value))
        timeseries = filter(lambda x: x[1] > 0.09, timeseries)
    return timeseries
