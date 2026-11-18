// The shell pipeline relies on Bash 5.2's execution behavior. Unknown version
// output is not evidence that this prerequisite is satisfied.
export function requireBash(version) {
  const match = /^GNU bash, version (\d{1,4})\.(\d{1,4})(?:[.\s(]|$)/.exec(
    version
  );
  if (!match || +match[1] < 5 || (+match[1] === 5 && +match[2] < 2)) {
    throw new Error(
      'Shell QA requires GNU Bash >= 5.2 with a recognized version'
    );
  }
}
