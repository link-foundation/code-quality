#!/usr/bin/env bats
@test "recognize a shell word through a pattern and heredoc" {
  source "${BATS_TEST_DIRNAME}/describe.sh"
  run describe_word word
  [ "$status" -eq 0 ]
  [ "$output" = 'matched word' ]
}
