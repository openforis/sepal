#!/usr/bin/env bash
fio --filename=/dev/xvda --rw=randread --bs=128k --iodepth=32 --ioengine=libaio --direct=1 --name=volume-initialize
fio --filename=/dev/xvdf --rw=randread --bs=128k --iodepth=32 --ioengine=libaio --direct=1 --name=volume-initialize