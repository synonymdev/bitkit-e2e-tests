#!/bin/bash

for d in $(adb devices | awk 'NR>1 && $2=="device" {print $1}'); do
  echo "Setting reverse ports for $d"

  adb -s "$d" reverse tcp:60001 tcp:60001
  adb -s "$d" reverse tcp:9735 tcp:9735
  adb -s "$d" reverse tcp:30001 tcp:30001
  adb -s "$d" reverse tcp:6288 tcp:6288
done

echo "Done."