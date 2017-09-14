import requests, json

googleapis_ft_url_query  = 'https://www.googleapis.com/fusiontables/v2/query?access_token=%s'
googleapis_ft_url_tables = 'https://www.googleapis.com/fusiontables/v2/tables?access_token=%s'
googleapis_ft_url_delete = 'https://www.googleapis.com/fusiontables/v2/tables/%s?access_token=%s'
googleapis_ft_url_upload = 'https://www.googleapis.com/upload/fusiontables/v2/tables/%s/import?uploadType=media&access_token=%s'

def createTable(token, ft):
    """  """
    url = googleapis_ft_url_tables % token
    headers = {'Content-type': 'application/json', 'Accept': 'text/plain'}
    r = requests.post(url, data=json.dumps(ft), headers=headers)
    if r.status_code == 401:
        raise FTException('TOKEN EXPIRED or NOT VALID')
    elif r.status_code != 200:
        raise FTException('NOT CREATED')
    return r.json().get('tableId')

def deleteTable(token, tableId):
    """  """
    url = googleapis_ft_url_delete % (tableId, token)
    print googleapis_ft_url_delete
    r = requests.delete(url)
    if r.status_code == 401:
        raise FTException('TOKEN EXPIRED or NOT VALID')
    elif r.status_code != 204:
        raise FTException('NOT DELETED')
    return True

def importTable(token, tableId, csvString):
    """  """
    url = googleapis_ft_url_upload % (tableId, token)
    headers = {'Content-type': 'application/octet-stream', 'Content-Length': str(len(csvString))}
    r = requests.post(url, data=csvString, headers=headers)
    if r.status_code == 401:
        raise FTException('TOKEN EXPIRED or NOT VALID')
    elif r.status_code != 200:
        raise FTException('NOT IMPORTED')
    return True

def getRowId(token, tableId, id):
    """  """
    rowId = None
    url = googleapis_ft_url_query % token
    sql = "SELECT ROWID FROM %s WHERE id='%s'" % (tableId, id)
    r = requests.post(url, data={'sql': sql})
    if r.status_code == 401:
        raise FTException('TOKEN EXPIRED or NOT VALID')
    try:
        rowId = r.json().get('rows').pop().pop()
    except (RuntimeError, AttributeError):
        pass
    return rowId

def selectRow(token, tableId, id):
    """  """
    url = googleapis_ft_url_query % token
    sql = "SELECT * FROM %s WHERE id='%s'" % (tableId, id)
    r = requests.post(url, data={'sql': sql})
    if r.status_code == 401:
        raise FTException('TOKEN EXPIRED or NOT VALID')
    return r.json().get('columns')

def insertRow(token, tableId, data, columns):
    """  """
    toInsert = []
    for column in columns:
        if data.get(column) is not None:
            toInsert.append("'%s'" % (data.get(column)))
    url = googleapis_ft_url_query % token
    sql = "INSERT INTO %s (%s) VALUES (%s)" % (tableId, ','.join(columns), ','.join(toInsert))
    r = requests.post(url, data={'sql': sql})
    if r.status_code == 401:
        raise FTException('TOKEN EXPIRED or NOT VALID')
    return True

def updateRow(token, tableId, data, columns, rowId):
    """  """
    toUpdate = []
    for column in columns:
        if data.get(column) is not None:
            toUpdate.append("%s = '%s'" % (column, data.get(column)))
    url = googleapis_ft_url_query % token
    sql = "UPDATE %s SET %s WHERE ROWID = '%s'" % (tableId, ','.join(toUpdate), rowId)
    r = requests.post(url, data={'sql': sql})
    if r.status_code == 401:
        raise FTException('TOKEN EXPIRED or NOT VALID')
    return True

def deleteRow(token, tableId, rowId):
    """  """
    url = googleapis_ft_url_query % token
    sql = "DELETE FROM %s WHERE ROWID = '%s'" % (tableId, rowId)
    r = requests.post(url, data={'sql': sql})
    if r.status_code == 401:
        raise FTException('TOKEN EXPIRED or NOT VALID')
    return True

class FTException(Exception):
    """  """
    pass