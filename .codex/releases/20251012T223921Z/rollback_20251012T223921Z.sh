#!/usr/bin/env bash
set -Eeuo pipefail
ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o Compression=no -o ControlMaster=auto -o ControlPath=/tmp/ssh-%r@%h:%p -o ControlPersist=10m sharityh@cp40.ezit.hu "
  set -e
  cd '/home/sharityh/app/wp-content'
  if [ -d plugins ];    then mv plugins    ._failed20251012T223921Z_plugins;    fi
  if [ -d mu-plugins ]; then mv mu-plugins ._failed20251012T223921Z_mu-plugins; fi
  if [ -d '/home/sharityh/app/wp-content/._backup20251012T223921Z_plugins' ]; then mv '/home/sharityh/app/wp-content/._backup20251012T223921Z_plugins' plugins; fi
  if [ -d '/home/sharityh/app/wp-content/._backup20251012T223921Z_mu-plugins' ]; then mv '/home/sharityh/app/wp-content/._backup20251012T223921Z_mu-plugins' mu-plugins; fi
  echo '[ROLLBACK] Code restored'
"
# Optional DB restore:
# ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o Compression=no -o ControlMaster=auto -o ControlPath=/tmp/ssh-%r@%h:%p -o ControlPersist=10m sharityh@cp40.ezit.hu "wp --path='/home/sharityh/app' db import ../bak_20251012T223921Z.sql"
