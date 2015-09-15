[Preliminary actions]
mkdir /opt/geoserver mount point source
mount /data/geoserver

Docker run script: docker run -d --name geoserver -e "ADMIN_PASSWD=@Fperkele.Geoserver" -v /data/sdms/geoserver:/data/geoserver -v /data/geoserver:/opt/geoserver/data_dir/workspaces  openforis/geoserver
