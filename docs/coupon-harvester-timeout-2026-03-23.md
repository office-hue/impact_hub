# Coupon Harvester Timeout Hardening

Date: 2026-03-23

## Scope

This change hardens the scheduled coupon harvester execution so it cannot hang for several hours in GitHub Actions.

## Changes

- Added workflow-level timeout to the harvest job.
- Wrapped the `ts-node` execution in a shell `timeout`.
- Forced explicit process exit from the CLI entrypoint after successful completion.

## Expected result

- Scheduled harvest runs stop failing as 6-hour cancellations.
- Hung Playwright/Gmail handles no longer keep the CI job alive indefinitely.
