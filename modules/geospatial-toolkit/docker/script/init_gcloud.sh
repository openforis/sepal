#!/bin/bash
set -e

echo
echo "*************************************"
echo "*** Installing Google Cloud Tools ***"
echo "*************************************"

wget -nv https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-152.0.0-linux-x86_64.tar.gz
tar -xzf google-cloud-sdk-152.0.0-linux-x86_64.tar.gz
mv google-cloud-sdk /usr/local/lib
/usr/local/lib/google-cloud-sdk/bin/gcloud components update
/usr/local/lib/google-cloud-sdk/install.sh -q
ln -s /usr/local/lib/google-cloud-sdk/bin/gcloud /usr/local/bin/
ln -s /usr/local/lib/google-cloud-sdk/bin/gsutil /usr/local/bin/
ln -s /usr/local/lib/google-cloud-sdk/bin/bq /usr/local/bin/
rm google-cloud-sdk-152.0.0-linux-x86_64.tar.gz
