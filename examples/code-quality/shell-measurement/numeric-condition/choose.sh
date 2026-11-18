#!/usr/bin/env bash
choose() {
  if [[ "$1" -eq 1 ]]; then
    printf yes
  else
    printf n
    printf o
  fi
  return 0
}
