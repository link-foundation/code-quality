// Playground samples. Each sample is a set of files plus an optional
// configuration written in Links Notation, the same canonical `.lino`
// format the CLI accepts with `--config quality.lino`.
import taintSource from '../../code-quality/taint/unsafe.js?raw';
import taintConfig from '../../code-quality/taint/quality.lino?raw';

const complexityConfig = `(
  rules (
    complexity 4
    parameters 3
  )
)
`;

export const samples = [
  {
    id: 'taint',
    files: [{ path: 'src/unsafe.js', content: taintSource }],
    config: taintConfig,
  },
  {
    id: 'python',
    files: [
      {
        path: 'app/settings.py',
        content: `import os

api_key = "sk-live-0123456789abcdef"


def load(expression):
    return eval(expression)
`,
      },
    ],
    config: '',
  },
  {
    id: 'shell',
    files: [
      {
        path: 'scripts/deploy.sh',
        content: `#!/usr/bin/env bash
set -euo pipefail

publish() {
  local target="$1"
  echo "publishing $target"
  rsync -a dist/ "$target"
}

release() {
  local target="$1"
  echo "publishing $target"
  rsync -a dist/ "$target"
}

publish "$@"
`,
      },
    ],
    config: '',
  },
  {
    id: 'polyglot',
    files: [
      {
        path: 'pricing/rate.go',
        content: `package pricing

func Rate(kind string, amount int, vip bool, region string) int {
	if kind == "gold" && vip {
		return amount / 2
	} else if kind == "silver" || region == "eu" {
		return amount - 10
	}
	for i := 0; i < amount; i++ {
		if i%7 == 0 {
			amount--
		}
	}
	return amount
}
`,
      },
      {
        path: 'pricing/rate.rs',
        content: `pub fn rate(kind: &str, amount: i64, vip: bool, region: &str) -> i64 {
    if kind == "gold" && vip {
        amount / 2
    } else if kind == "silver" || region == "eu" {
        amount - 10
    } else {
        amount
    }
}
`,
      },
      {
        path: 'Pricing/Rate.cs',
        content: `public static class Rate {
    public static int Compute(string kind, int amount) {
        return kind == "gold" ? amount / 2 : amount;
    }
}
`,
      },
    ],
    config: complexityConfig,
  },
];

export const formats = ['text', 'json', 'sarif', 'lino'];
