# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- At-rest encryption for stored user Discord tokens (`data/tokens.db`) using RSA-OAEP SHA-256 key material managed at runtime (`data/token-keys.json` or environment-provided keys), with in-memory decryption only when tokens are used by AutoQuest/HypeSquad flows.
- User-facing security notices in AutoQuest/HypeSquad token configuration and panel messaging clarifying the open-source trust model and recommending trust only in the official **eternal#3694** instance hosted from the original source.

### Changed
- Migrated the runtime, scripts, and test suites from CommonJS to ECMAScript modules (`"type": "module"`), including asynchronous command/event loading and ESM-compatible module imports/exports.
- Updated architecture and README documentation to reflect ESM module loading behavior and encrypted token storage.