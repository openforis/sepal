FROM ubuntu:bionic
ENV DEBIAN_FRONTEND=noninteractive

# update and install base packages
RUN apt-get update && apt-get install -y \
  curl \
  dnsutils \
  gettext \
  git \
  gnupg \
  htop \
  libssl-dev \
  libffi-dev \
  multitail \
  nano \
  packer \
  procps \
  python3 \
  python3-gdal \
  python3-pip \
  gdal-bin \
  screen \
  software-properties-common \
  sudo \
  unzip \
  wget \
  zip

# fix "mesg: ttyname failed: Inappropriate ioctl for device" warning
RUN cp /etc/profile /root/.profile

# install gdal
RUN apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y
RUN apt-get update && apt-get install -y gdal-bin

# install mongodb
RUN wget -qO - https://www.mongodb.org/static/pgp/server-4.2.asc | apt-key add -
RUN echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-4.2.list  
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt-get update && apt-get install -y mongodb-org yarn

# install diskus
RUN wget -q https://github.com/sharkdp/diskus/releases/download/v0.6.0/diskus_0.6.0_amd64.deb
RUN dpkg -i diskus_0.6.0_amd64.deb && rm diskus_0.6.0_amd64.deb

# create sepal user
RUN useradd sepal -m && usermod -aG sudo sepal && echo 'sepal     ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

# switch to sepal user
USER sepal

# install sdkman and java
RUN curl -s "https://get.sdkman.io" | bash
RUN bash -c "source '/home/sepal/.sdkman/bin/sdkman-init.sh' && sdk install java 12.0.2.hs-adpt"

# install nvm and nodejs
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
RUN bash -c "source /home/sepal/.nvm/nvm.sh && nvm install node 13 && npm install -g nodemon"

# setup sepal
ENV SEPAL_HOME=/usr/local/lib/sepal
RUN echo 'PATH="$HOME/.local/bin:$PATH"' >> /home/sepal/.bashrc

# rabbitmqctl alias via docker
RUN echo 'alias rabbitmqctl="sudo docker exec -it rabbitmq rabbitmqctl"' >> /home/sepal/.bash_aliases
