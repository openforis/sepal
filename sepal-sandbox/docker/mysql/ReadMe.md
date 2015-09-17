useradd -m -u 999 -g 999 mysql
sudo chown -R 999:999 /data/mysql
mkdir /data/supervisor/mysql

docker run --restart always --name mysql -v /data/logs/mysql:/var/log/supervisor -v /data/mysql:/var/lib/mysql -d -e "MYSQL_DATABASE=sdms" -e "MYSQL_ROOT_PASSWORD=VJfn6LKfuhn56HZS" -e "MYSQL_USER=sepal" -e "MYSQL_PASSWORD=qwerrhrvf5435AZDASD" openforis/mysql
