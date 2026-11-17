#!/usr/bin/env bash
choose() {
  if [[ "$1" -eq 7 ]]; then
    printf '%s' "$((7 + 3))"
  else
    printf n
    printf o
  fi
  return 0
}
