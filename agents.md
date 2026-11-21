# Agents Guide

## Environment

- **Operating system:** Debian GNU/Linux 13 (trixie), Linux kernel 6.12.116+deb13-amd64, `x86_64`
- **Shell:** Bash
- **Working directory:** `/media/szh/70DF-C044/AI/Training_LLM/002-AIAgents/01-TestProjects/02-TaskAdmin/taskadmin`

## Package managers

### System packages

- `apt` (3.0.4) — Debian system package manager
  - Install: `sudo apt install <package>`
  - Update index: `sudo apt update`

### JavaScript / Node.js

- `npm` (11.17.0) — available at `/opt/node/24.19.0/bin/npm`
- **Node.js:** v24.19.0
- No `pnpm`, `yarn`, or `bun` installed.

### Python

- `pip` / `pip3` — available at `/usr/bin/pip`
- **Python:** 3.13.5
- No `poetry`, `uv`, or `conda` installed.

### Other toolchains

- **Java:** `java`, Maven 3.9.16 (`/opt/maven/3.9.16/bin/mvn`), Gradle 8.10 (`/opt/gradle/8.10/bin/gradle`)
- **C/C++:** `gcc`, `make`
- **Containers:** `docker`

## Git conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages.
  - Format: `<type>[optional scope]: <description>`
  - Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
  - Example: `feat(auth): add JWT token refresh`

## Notes for agents

- Use `apt` for OS-level dependencies; use `npm` for Node packages and `pip` for Python packages.
- Prefer the existing tool versions listed above; do not introduce new package managers unless required.
