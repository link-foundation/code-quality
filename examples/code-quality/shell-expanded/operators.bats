#!/usr/bin/env bats
setup() {
  source "$BATS_TEST_DIRNAME/operators.sh"
}

@test "ordering results are exact" {
  run ordered
  [ "$status" -eq 0 ]
  [ "$output" = $'0\n0\n1\n1' ]
}

@test "product remains even" {
  run product
  [ "$status" -eq 0 ]
  [ "$((output % 2))" -eq 0 ]
}
