# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Migrated the runtime, scripts, and test suites from CommonJS to ECMAScript modules (`"type": "module"`), including asynchronous command/event loading and ESM-compatible module imports/exports.
- Updated architecture and README documentation to reflect ESM module loading behavior.