#!/bin/bash


export sandbox_user=sepal-user

function exportEnvironment {
    while read line; do
      export $line
    done </etc/environment
}

function template {
    envsubst < $1 > $2
    chmod $3 $2
}


template /templates/shiny-server.conf /etc/shiny-server/shiny-server.conf 0444
template /templates/supervisord.conf /etc/supervisor/conf.d/supervisord.conf 0400

sandbox_user_id=`stat -c '%u' /home/$sandbox_user`
home_group_id=`stat -c '%g' /home/$sandbox_user`

groupadd -g ${home_group_id} sepal-user
useradd sepal-user -u ${sandbox_user_id} -g ${home_group_id} -s /usr/bin/bash
mkdir -p /home/sepal-user/.ssh
authorized_keys=/home/$sandbox_user/.ssh/authorized_keys
echo $USER_PUBLIC_KEY > $authorized_keys
chown $sandbox_user_id:$home_group_id /home/sepal-user/.ssh
chown $sandbox_user_id:$home_group_id $authorized_keys

mkdir -p /home/$sandbox_user/.log/shiny
chown -R $sandbox_user_id:$home_group_id /home/$sandbox_user/.log
mkdir -p /home/$sandbox_user/.shiny
chown -R $sandbox_user_id:$home_group_id /home/$sandbox_user/.shiny

rm -rf /templates

printf '%s\n' \
    "R_LIBS_USER=/home/$sandbox_user/.R/library" \
    "R_LIBS_SITE=/usr/local/lib/R/site-library:/usr/lib/R/site-library:/usr/lib/R/library:/shiny/library" \
    >> /etc/environment

cp /etc/environment /etc/R/Renviron.site
sed -i -e 's/\/usr\/lib\/x86_64-linux-gnu/\/usr\/lib\/x86_64-linux-gnu:\/lib\/x86_64-linux-gnu/g' /usr/lib/R/etc/ldpaths

TOT_MEM=$(awk '/MemFree/ { printf "%i\n", $2/1024 }' /proc/meminfo)
if [[ (TOT_MEM -lt 3000) ]] ;then
  GPT_MAX_MEM=1024
  GPT_MIN_MEM=1024
elif [[ (TOT_MEM -ge 3000) && (TOT_MEM -lt 10000) ]] ;then
  GPT_MAX_MEM=2048
  GPT_MIN_MEM=2048
elif [[ (TOT_MEM -ge 10000) && (TOT_MEM -lt 20000) ]] ;then
  GPT_MAX_MEM=8192
  GPT_MIN_MEM=8192
elif [[ (TOT_MEM -ge 20000) ]] ;then
  GPT_MAX_MEM=16384
  GPT_MIN_MEM=16384
else
  GPT_MAX_MEM=1024
  GPT_MIN_MEM=1024
fi
printf '%s\n' \
    "-Xmx${GPT_MAX_MEM}m" \
    "-Xms${GPT_MIN_MEM}m" \
    "-XX:+AggressiveOpts" \
    "-Xverify:none" \
    "-Dsnap.log.level=ERROR"

printf '%s\n' \
    "-Xmx${GPT_MAX_MEM}m" \
    "-Xms${GPT_MIN_MEM}m" \
    "-XX:+AggressiveOpts" \
    "-Xverify:none" \
    "-Dsnap.log.level=ERROR" \
    > /usr/local/snap/bin/gpt.vmoptions

userHome=/home/$sandbox_user
cp -n /etc/skel/.bashrc "$userHome"
cp -n /etc/skel/.profile "$userHome"
cp -n /etc/skel/.bash_logout "$userHome"

chmod g+w "$userHome/.bashrc"
chmod g+w "$userHome/.profile"
chmod g+w "$userHome/.bash_logout"

exportEnvironment
source /home/$sandbox_user/.bashrc
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
