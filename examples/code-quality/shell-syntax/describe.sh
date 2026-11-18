#!/usr/bin/env bash
describe_word() {
  [[ "${1}" == word ]] || return 2
  case "${1}" in
    word)
      cat <<'MESSAGE'
matched word
MESSAGE
      ;;
  esac
}
