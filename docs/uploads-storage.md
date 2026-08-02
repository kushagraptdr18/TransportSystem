# File & Image Storage

_Last updated: 2 Aug 2026_

Where uploaded bytes live, why, and what has to change to move them to object
storage.

---

## 1. The problem this records

Uploads were written to `UPLOAD_DIR` on the local filesystem, with only the path
stored in the database. On Render's free tier `UPLOAD_DIR` is `/tmp/uploads` and
there is **no persistent disk**, so every redeploy and every restart wipes the
files while the rows keep pointing at them. The result is a 404 on an image that
the database insists exists, and a re-upload that works until the next deploy.

This is not visible in development, where the directory persists.

## 2. What is stored where, today

| Upload | Bytes | Path column | Status |
| --- | --- | --- | --- |
| Firm logo / seal | `Firm.logoData` / `Firm.sealData` (`BYTEA`) | `logoPath` / `sealPath` kept for pre-move rows | **In the database** — survives redeploys |
| POD attachments | `UPLOAD_DIR` | path column | **Still on disk — still lost on redeploy** |
| Document registration files | `UPLOAD_DIR` | path column | **Still on disk — still lost on redeploy** |

Only branding was moved. Two images per firm, capped at 2 MB each, is well
within what a row should carry. Scans and PDFs are not: they are larger, there
are many per firm, and every query that touches the row would drag the bytes
along unless carefully projected. Those need object storage or a mounted disk,
not a `BYTEA` column — see §4.

### How branding is served

`GET /api/uploads/firm?kind=logo|seal&v=<brandingVersion>`

- Scoped to the **session's firm**, not an id in the URL, so one tenant can
  never address another's image.
- `brandingVersion` increments on every upload. The path is otherwise fixed, so
  without it a browser would keep showing the previous image from cache.
- Falls back to reading `logoPath` / `sealPath` from disk when a row has a path
  but no bytes. That is the only way a pre-move logo keeps working; when the
  file is gone (the usual case) it 404s and the firm re-uploads once.

### The one rule for callers

Nothing outside `src/lib/branding.ts` builds an image URL. Call
`firmImageUrl(firm, "logo" | "seal")` and render what it returns, or nothing if
it returns `null`. **This is what makes §4 cheap** — a signed S3 URL is built in
that one function and no print template changes.

---

## 3. Not backfillable

The migration adds columns but copies nothing. The files it would need to copy
are, by definition, the ones already lost. Each firm re-uploads its logo and
seal once, and it then persists.

---

## 4. Moving to S3 / R2 later

Worth doing when POD and document-registration files matter — they are the real
motivation, not branding. A GST-registered transporter is expected to produce a
POD on demand, and silently losing them on deploy is a business risk, not a
cosmetic one.

### 4.1 Choose the bucket

Cloudflare **R2** over S3 unless there is a reason not to: S3-compatible API, no
egress charges, and the volume here (a few thousand scans a year) sits inside the
free tier. Everything below is identical for either — R2 speaks the S3 protocol.

Never make the bucket public. These are commercial documents belonging to
identifiable parties.

### 4.2 Environment

```
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=transport-tms
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Add to `.env.example` and to `render.yaml` with `sync: false` so the secrets are
pasted in the dashboard, never committed. Delete the `UPLOAD_DIR` entry and its
comment once nothing reads it.

### 4.3 Storage adapter

New `src/lib/storage.ts`, one interface with two implementations, chosen by
whether `S3_BUCKET` is set:

```ts
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>
  delete(key: string): Promise<void>
  /** short-lived download URL, or null when the adapter streams instead */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | null>
}
```

- `LocalStorage` — the current filesystem behaviour, for development.
- `S3Storage` — `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

Key layout `<tenantId>/<module>/<uuid>.<ext>`, which is what the path columns
already hold, so they become S3 keys with no reformatting.

### 4.4 Route changes

- `api/uploads/pod` and `api/uploads/docreg` call `storage.put()` instead of
  `writeFile`.
- `api/uploads/[...path]` keeps its tenant-prefix check, then either redirects to
  `storage.signedUrl()` or streams `storage.get()`. **Keep the tenant check** —
  it is the only thing stopping one firm reading another's documents, and moving
  the bytes elsewhere does not move that responsibility.
- `api/uploads/firm` needs nothing. Branding stays in the database; a `BYTEA`
  column is a better fit than a network round-trip for a 40 KB logo on every
  printed page.

### 4.5 Migrating what exists

Files still on the current disk are whatever was uploaded since the last deploy —
possibly nothing. A one-off script walks `UPLOAD_DIR`, `put`s each file under its
existing relative path, and logs what it moved. **The path columns do not change
value**, so no data migration and no downtime. Anything already lost stays lost;
that is not fixable from here.

### 4.6 What would still be wrong afterwards

- **No virus scanning** on uploaded files. Fine while staff-only; reconsider
  before any customer-facing upload.
- **No size cap** on POD and document uploads — only branding is capped at 2 MB.
  Object storage makes a large upload cheap rather than fatal, which is exactly
  when an unbounded cap starts costing money.
- **Deletes are not wired up.** Replacing a POD attachment orphans the previous
  object. Harmless on a filesystem, a slow bill on metered storage. `delete()` is
  in the interface above for this reason — implement it with the migration, not
  after.
