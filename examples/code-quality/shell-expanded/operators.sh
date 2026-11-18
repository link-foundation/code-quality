#!/usr/bin/env bash
ordered() {
  printf '%s\n' "$((7 < 3))" "$((7 <= 3))" "$((7 > 3))" "$((7 >= 3))"
}

product() {
  printf '%s\n' "$((5 * 2))"
}
