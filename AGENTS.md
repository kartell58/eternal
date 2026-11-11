# Repository Maintenance Standards

## Documentation

- Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) for `CHANGELOG.md`.
- Keep changelog entries under the `Unreleased` section until a release is prepared.
- Organize changelog entries using the standard categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`.
- Write clear, concise documentation in English.
- Keep `README.md` focused on the project's purpose, features, requirements, installation, usage, and development instructions.
- Use `docs/` for detailed technical documentation, architecture notes, and design decisions.
- Update documentation whenever a change affects documented behavior, commands, configuration, or supported platforms.
- Do not document features that have not been implemented.
- Every project ships a `LICENSE` file; the README names the license and links it.

## README and Docs

The order below is part of the standard: a reader who wants to know what a
project is should get it before scrolling past build instructions.

### README skeleton

1. `# <Project name>` and one paragraph stating what it is.
2. A sentence placing it in the family or workspace it belongs to.
3. `## Scope` with `### What it does` and `### What it is not`. The second
   subsection is not optional: a stated non-goal is cheaper than a support
   question later.
4. A capability table with a `Status` column. Anything unsupported stays in the
   table with its reason instead of being left out.
5. `## Requirements` with exact versions.
6. `## Build and test` with commands that can be pasted as they are.
7. `## Usage` with the invocation form and a table of options and their effect.
8. `## Worked example` with real input and real output, noting what the output
   approximates.
9. `## Architecture` pointing at `docs/ARCHITECTURE.md`.
10. `## Limitations`, itemized, each item naming what is wrong rather than
    apologizing for it.
11. `## License`, naming the license and linking the file.

### Architecture doc

`docs/ARCHITECTURE.md` is for a reader who has to change something:

1. `# Architecture` and one sentence on what the system does.
2. A text diagram of the flow.
3. One section per stage, numbered, with the code path in the heading
   (`## 3. Function recovery — internal/analysis`).
4. Each stage explains what it does, the decision taken, and why.
5. A closing section on what is deliberately not done, and why.

### Style

- Write in English.
- Address the reader as "you".
- Name code by path and identifier, so a reader can jump to it.
- Explain why a decision was made, not only what it is.
- State the evidence: what was run, what was compared, what was assumed.

## File Naming Conventions

- Use `SCREAMING-KEBAB-CASE` for Markdown documentation files inside `docs/`.
- Keep file extensions lowercase, such as `.md`.
- Apply the convention consistently to documentation filenames, including
  `ARCHITECTURE.md`, `INSTALL.md` and `GAME-PATCHES.md`.
- Update all references, links, scripts and CI configurations when renaming
  files.
- Rename through an intermediate name when only the case changes, so the rename
  also takes effect on a case-insensitive filesystem.
- The rule applies to file names only. Headings, anchors and links inside the
  document keep their own spelling.
- Do not rename source files or resource files based on this rule; follow the
  conventions of their respective ecosystems.
- Preserve filenames required by external tools, build systems or platform
  conventions: `README.md`, `LICENSE`, `CHANGELOG.md`, `AGENTS.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`.

## Commit Convention

- Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Use the format `<type>(<scope>): <description>`, omitting the scope when unnecessary.
- Use imperative, concise descriptions.
- Use lowercase descriptions unless proper nouns or language conventions require otherwise.
- Common types include `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, and `chore`.
- Use `!` for breaking changes and document them in the commit footer when appropriate.
- Do not create commits unless explicitly requested.

### Commit Bodies

The subject line records what changed. The body explains why it was necessary,
written as prose in paragraphs rather than as a list of changed files. The
subject is what a reader scans; the body is what they read when the change turns
out to matter.

- Lead with the problem that existed before the change, not with the diff. Explain what was
  missing, broken, or unknowable, and why the change was the only way to address it.
- Name the specific files, functions, and fields involved. `Parser.read` and `Config.load`
  tell a reader where to look; "control flow recovery" does not.
- State what was deliberately not done, and why. A reader who discovers an absent feature later
  should find the reasoning already recorded rather than assume it was overlooked.
- Record where the evidence came from. If behaviour was confirmed by execution, say so and
  what was compared. If a claim rests on assumptions, say that instead of asserting it.
- Note where evidence was missing and a claim was softened for that reason. An unverified
  figure belongs in the commit as an unverified figure.
- Hard-wrap prose at roughly 70 columns. Long bodies are expected; a commit that reorganises a
  subsystem or lands a pipeline belongs in dozens of lines.
- Prefer a defect's cause to its symptom. "The block map returned -1 and the list threw" is
  useful six months later; "fixed a crash" is not.

Keep the body honest about verification. A test that passes with and without its fix pins
nothing, and a decompilation that was only eyeballed is not evidence.

## Code Quality

- Follow the conventions and idioms of the project's implementation language.
- Prefer simple, readable, maintainable solutions over unnecessary abstractions.
- Avoid adding dependencies when the standard library or existing dependencies are sufficient.
- Keep functions, types, and modules focused on clear responsibilities.
- Avoid unrelated refactoring when implementing a specific change.
- Remove dead code, unused imports, obsolete files, and temporary debugging output introduced by your changes.
- Do not duplicate existing functionality without a clear reason.
- Do not introduce compatibility layers or fallback behavior without a concrete requirement.
- Add comments only when they explain non-obvious reasoning, constraints, or behavior.
- Write code comments in English.
- Never claim that a feature works without sufficient evidence.

## Testing and Validation

- Add or update tests for new functionality and bug fixes.
- Include regression tests for bugs when practical.
- Run relevant tests and validation commands after making changes.
- Run formatting, linting, static analysis, and build checks when supported by the project.
- Do not modify tests merely to make an implementation pass.
- Do not remove or weaken assertions to conceal failures.
- Distinguish pre-existing failures from regressions introduced by your changes.
- Report any checks that could not be executed and explain why.

## Dependencies and Configuration

- Prefer stable, maintained dependencies with a clear purpose.
- Avoid introducing dependencies for trivial functionality.
- Keep dependency declarations and lockfiles consistent.
- Never commit credentials, access tokens, private keys, or other secrets.
- Do not overwrite user configuration or discard unrelated working-tree changes.
- Avoid platform-specific assumptions unless the project explicitly requires them.

## Git and Repository Hygiene

- Preserve the existing Git history.
- Inspect the working tree before making changes.
- Do not discard, reset, or overwrite user changes without explicit permission.
- Do not create commits, tags, releases, or push changes unless explicitly requested.
- Keep generated artifacts, caches, binaries, and temporary files out of version control unless they are intentional project assets.
- Maintain a relevant `.gitignore`.
- Keep the repository structure consistent with the project's language ecosystem and established architecture.
- In a workspace holding several repositories, treat each as its own: run its checks and commit
  only inside it.

## Change Management

- Understand the existing implementation before modifying it.
- Prefer targeted changes that solve the stated problem.
- Preserve existing behavior unless a change is explicitly required.
- Update tests and documentation alongside implementation changes.
- Check for affected callers, imports, configuration files, scripts, CI workflows, and documentation when renaming or moving code.
- Do not silently change public APIs, CLI behavior, file formats, or compatibility requirements.
- Explain important trade-offs when multiple reasonable implementations exist.

## Completion Criteria

Before considering a task complete:

1. Verify that the implementation satisfies the requested behavior.
2. Review the diff for unintended changes.
3. Run the relevant tests and validation commands.
4. Update documentation and the changelog when applicable.
5. Report what changed, which checks passed, and any remaining limitations.

## Project-Specific Instructions

- Follow any additional instructions defined in nested `AGENTS.md` files.
- Treat project-specific architecture, supported platforms, and compatibility requirements as authoritative.
- Do not assume that conventions from another repository of yours apply when they conflict
  with the current project's explicit requirements.
