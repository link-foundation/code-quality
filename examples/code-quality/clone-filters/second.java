@acme.Trace(value = {"Second", "audit"}) class Sample {
  @Second int read(@Named("Second") int value) { return value + 2; }
}
