[Preliminary actions]
mkdir /opt/geoserver mount point source
mount /data/geoserver
/data/logs/geoserver

docker run --restart always -d --name geoserver -e "ADMIN_PASSWD=@Fperkele.Geoserver" -v /data/sdms/geoserver:/data/geoserver -v /data/geoserver:/opt/geoserver/data_dir/workspaces -v /data/logs/geoserver:/opt/geoserver/data_dir/logs openforis/geoserver

[log files]
docker logs -f geoserver