#!/usr/bin/env bash

set -ex

CONTAINER_NAME='piggy-postgres'

existing_container=$(docker ps | grep "$CONTAINER_NAME" | cut -d ' ' -f 1)

if [ -n "$existing_container" ]; then
  echo "Stopping and removing container: ${existing_container}"
  docker stop "$existing_container"
  docker rm "$existing_container"
  exit 0
fi

stopped_container=$(docker ps -a | grep "$CONTAINER_NAME" | cut -d ' ' -f 1)

if [ -n "$stopped_container" ]; then
  echo "Deleting stopped container: ${stopped_container}"
  docker rm "$stopped_container"
fi
