# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability involving token exposure, arbitrary code execution, unsafe navigation, renderer-to-main privilege escalation, or unintended fantasy-team mutations. Use GitHub's private vulnerability reporting feature once the repository is published.

Until then, contact the repository maintainer privately with reproduction steps and the affected commit.

## Trust boundaries

- Sleeper league data comes from a public, read-only API.
- OpenAI credentials are owned by Codex in an app-specific `CODEX_HOME`.
- The renderer is untrusted and receives only typed IPC operations.
- Model and web content are untrusted inputs; model reports are schema-validated.
- The local MCP binds to loopback and intentionally exposes only read-only public league operations.

## Supported versions

Security fixes are applied to the latest development branch until tagged releases begin. After the first stable release, this file will list supported release lines.
