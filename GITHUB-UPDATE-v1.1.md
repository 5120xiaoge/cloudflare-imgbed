# GitHub Update v1.1

Application snapshot: official 2.7.8 plus Guolairen customization v1.4.
Official base commit: `99eb1a29fa24f3d2dbedf4ec8eff9d0ca425d7d0`.
Fork base commit: `b10fee45`.
Prepared: 2026-11-01.

## Scope

- Includes the music/compression shortcuts, animated borders, home navigation,
  responsive toolbar, backend fixes, and focused regression tests.
- Preserves existing fork history and all `.github` files.
- Retains older hashed frontend assets for compatibility; the new entry page
  references the updated assets.
- Uses `[skip ci]` for this upload to skip push-triggered GitHub Actions.
  This does not disable scheduled/manual jobs or external deployment services.
- Does not publish a release or manually deploy the application.

## Workflow Compatibility

The existing Worker workflow is not upgraded in this upload. It still supports
the previously configured simple `WORKER_VARS` values. New structured variables
with `type: "secret"` require a subsequent workflow update or a separate,
authorized Worker secret upload. The new expiry-cleanup cron and extra Wrangler
configuration also require a workflow update to pass their environment values.
Do not assume these production features are configured by this source upload.

## Verification

- 192 focused backend tests passed in the synchronized checkout.
- Customization defaults and configuration precedence checks passed.
- 102 backend modules loaded and sample requests passed in check-only mode,
  without a listener or real storage.
- Desktop/mobile UI checks were performed on the v1.4 source snapshot before
  synchronization; production storage and deployment remain unverified.
- See `CUSTOMIZATION-v1.4.md` for remaining security and runtime limitations.
