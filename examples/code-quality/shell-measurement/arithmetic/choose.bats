#!/usr/bin/env bats
@test "the positive choice computes ten without asserting its status" {
  source "${BATS_TEST_DIRNAME}/choose.sh"
  run choose 7
  [ "$output" = 10 ]
}
