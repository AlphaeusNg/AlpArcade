# CI readiness: Ubuntu 26.04

Date: 2026-10-13

GitHub's `ubuntu-latest` label moves to Ubuntu 26.04 starting 19 Oct 2026, as announced in [runner-images issue #14748](https://github.com/actions/runner-images/issues/14748).

Temporary probe commit `430425cdfebae3652089b5da03a46eaf967b8f8c` set `runs-on: ubuntu-26.04` in `.github/workflows/ci.yml`. It was later reverted with `git revert`, so `ci.yml` matches main.

The [probe run](https://github.com/AlphaeusNg/AlpArcade/actions/runs/38289352944) concluded **success**. It used runner image `ubuntu-26.04`, version `20260927.149.1` (provisioner `20260901.588`), and Node 24.

| Step | Result |
| --- | --- |
| Set up job | success |
| Check out repository (`actions/checkout@v7`) | success |
| Set up Node.js (`actions/setup-node@v7`) | success |
| Install locked dependencies (`npm ci --ignore-scripts`) | success |
| Test (`npm test`) | success |
| Install Chromium (`npx playwright install --with-deps chromium`) | success |
| Browser cabinet smoke (`npm run test:browser`) | success |

Conclusion: no changes needed; `ubuntu-latest` kept.

This file lives in `.github/`, which is not served by GitHub Pages. Pages serves `/` of main; `/.github/` returns 404.

Built with Codex CLI (Grok Build returned 402 balance exhausted).
