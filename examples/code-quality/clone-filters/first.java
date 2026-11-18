@acme.Trace(value = {"First", "audit"}) class Sample {
  @First int read(@Named("First") int value) { return value + 2; }
}
