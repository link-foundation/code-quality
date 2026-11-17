#!/usr/bin/env bats
@test "chooses the positive branch" {
  source "${BATS_TEST_DIRNAME}/choose.sh"
  result=$(choose 1)
  [ "$result" = yes ]
}
