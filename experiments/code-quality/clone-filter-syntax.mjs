// Original finite grammar observations for optional clone-token filters.
import assert from 'node:assert/strict';
import { withSyntax, walk } from '../../src/quality/syntax.js';

const fixtures = {
  java: '@com.acme.Trace(value = {1, 2}) class Sample {\n  @Deprecated int read(@Named("left") int value) { return value + 2; }\n  double[] numbers = {2, 0x2, 02, 0b10, 2.0, 0x1.0p1};\n  @interface Flag { String value(); }\n}\n',
  csharp:
    'using System.Text;\nusing Alias = System.Text.StringBuilder;\nusing static System.Math;\n[assembly: Origin("native")]\n[Marker(Name = "first")] class Sample {\n  [return: Marker] int Read([Marker] int value) { using (var resource = Open()) { return value + 2; } }\n}\n',
};
for (const [language, content] of Object.entries(fixtures)) {
  await withSyntax(language, content, ({ root }) => {
    assert.equal(root.hasError(), false, language);
    const records = [...walk(root)]
      .filter((node) => /annotation|attribute|using|literal/.test(node.type))
      .map(({ type, startIndex, endIndex, text }) => ({
        type,
        start: startIndex,
        end: endIndex,
        text,
      }));
    console.log(JSON.stringify({ language, records }));
  });
}
