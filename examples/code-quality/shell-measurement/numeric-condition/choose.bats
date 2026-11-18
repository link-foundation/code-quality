#!/usr/bin/env bats
@test "the positive choice produces yes without asserting its status" {
  source "${BATS_TEST_DIRNAME}/choose.sh"
  run choose 1
  [ "$output" = yes ]
}
