#!/usr/bin/env bats
@test "chooses the positive branch without asserting status" {
  source "${BATS_TEST_DIRNAME}/choose.sh"
  run choose 1
  [ "$output" = yes ]
}
