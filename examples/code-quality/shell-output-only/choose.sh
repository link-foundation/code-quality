#!/usr/bin/env bash
choose() {
  if [[ "$1" -eq 1 ]]; then
    printf yes
  else
    printf no
  fi
  return 0
}
