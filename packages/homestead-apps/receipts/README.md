# Receipts App

The receipts you keep because the tax code will eventually care, in two tabs:

- **Medical** — out-of-pocket medical expenses, held against a future HSA
  withdrawal you can take tax-free whenever you choose.
- **Charitable** — donations to charity, totalled per tax year.

They share a shape — an organization, a date, an amount, a scan of the paper —
and almost nothing else, so they get one page and two tabs rather than one
merged list. The tab lives in the URL (`/receipts?tab=charitable`), so a link
can point at either.

> **Naming.** The medical collection is `hsa-receipts` on the wire and its
> records are `hsa-receipt`s. That predates the charitable tab and stays: aepbase
> has no rename, so a new name would mean copying every row, re-uploading every
> file blob, and re-pointing every grant and back-link, for a string no user ever
> sees. See [`docs/design/receipts.md`](../../homestead-site/docs/design/receipts.md) §2.2.

## Medical tab

### Liquidatable tax-free cash

The hero metric: everything you've paid out of pocket and not yet reimbursed —
the total you could withdraw from your HSA today, tax-free. Reimbursing a
receipt takes it out of the number.

### Capture

- **From Documents.** Upload a receipt in the Documents app; the pipeline
  classifies it as a `medical-receipt`, extracts merchant, date, amount,
  category and patient, and mirrors it here. The created receipt links back to
  the document via `source_document` rather than storing a second copy of the
  file. See `documents/doc-types/medical-receipt.ts` and its `post_classify`
  hook.
- **By hand.** "Add receipt" opens a form over the schema — merchant, service
  date, amount, category and a file, plus an optional patient, person link and
  notes.

### Audit Vault

Every receipt, filterable by status and by person, with a running total for
whatever the filters left showing. "Mark reimbursed" moves a receipt out of the
liquidatable total.

## Charitable tab

### The year's deduction

Everything on the tab is scoped to one tax year, because a donation belongs to
exactly one and the question is always "what did I give in *year*". The year
lives in the URL (`?tab=charitable&year=2025`) so the answer is linkable; with
no year named, the tab opens on this year when there's giving in it, and
otherwise on the most recent year that has any.

Two rules decide every figure (`charitable/stats.ts`):

- **Which year a gift counts for** — its `tax_year` when the acknowledgment
  states one, otherwise the year of the donation date. A check mailed on 30
  December is deductible for the year it was sent even though the letter is
  dated January.
- **What a gift is worth** — what you gave less anything you got back
  (`amount − value_received`). A charity that hands you a $60 tote for a $250
  gift has to say so, and only the $190 is deductible.

### Unvalued gifts and missing acknowledgments

A charity describes donated goods but never values them, so a gift of goods
arrives with no amount. It reads **"Needs a value"** in the list and is counted
in the "needs attention" tile — it contributes nothing to the total until
someone puts a number on it, rather than being silently treated as zero.

The same tile counts gifts of **$250 or more with no acknowledgment on file**
(no uploaded file and no source document), which the IRS doesn't allow to be
deducted at all. Those rows carry a warning marker in the list.

### By year

A compact table of every year with giving — receipts, cash, non-cash, total —
so three years of history read at a glance. Clicking a row moves the whole tab
to that year.

### Capture

Same two ways in. In Documents, an acknowledgment letter classified as
`charitable-donation-receipt` is mirrored here by its `post_classify` hook,
which infers the gift type from what was extracted (a stated amount → Cash, a
described pile of goods → Goods, neither → Other) and leaves a gift of goods
unvalued rather than inventing a number.

## Structure

```
receipts/
├── shared/        # the kernel both tabs render: KPI card, stat tiles,
│                  # breakdown bars, thumbnail, empty state, vault shell
├── medical/       # hsa-receipt: schema, hooks, components, category config
├── charitable/    # charitable-receipt: schema, hooks, components, year math
├── components/    # the page shell and its tabs
├── e2e/           # Page Objects, seed helpers, CRUD specs for both tabs
└── app.config.ts  # app metadata; aggregates both resource definitions
```

## Schema

### `hsa-receipts`

| Field | Type | Required | Description |
|---|---|---|---|
| `merchant` | string | ✔ | Provider name (e.g. "CVS Pharmacy") |
| `service_date` | date-time | ✔ | Date of service |
| `amount` | number | ✔ | Amount paid |
| `category` | enum | ✔ | Medical, Dental, Vision, Rx |
| `patient` | string | | Patient name as printed |
| `person` | ref → person | | Canonical link, collapsing name variants |
| `status` | enum | ✔ | Stored (default) or Reimbursed |
| `receipt_file` | file | | Image or PDF, ≤10MB. Absent when mirrored |
| `source_document` | string | | `documents/{id}` it was derived from |
| `notes` | string | | |
| `created_by` | ref → user | | |

### `charitable-receipts`

| Field | Type | Required | Description |
|---|---|---|---|
| `organization` | string | ✔ | The charity |
| `organization_ein` | string | | As printed; distinguishes same-named chapters |
| `donation_date` | date-time | ✔ | When the gift was made |
| `tax_year` | number | | The year claimed against; falls back to the date's year |
| `gift_type` | enum | ✔ | Cash (default), Goods, Other |
| `amount` | number | | What you're claiming. Blank on an unvalued gift of goods |
| `value_received` | number | | Value of anything received back; reduces the deduction |
| `description_of_property` | string | | Non-cash: what was given |
| `goods_or_services` | string | | The acknowledgment's wording, verbatim |
| `donor` | string | | Donor name as printed |
| `person` | ref → person | | Canonical link |
| `status` | enum | ✔ | Unclaimed (default) or Claimed |
| `receipt_file` | file | | Image or PDF, ≤10MB. Absent when mirrored |
| `source_document` | string | | `documents/{id}` it was derived from |
| `notes` | string | | |
| `created_by` | ref → user | | |

Deductible amount and "is this substantiated" are computed, never stored — a
stored copy would drift from the fields it's derived from.

## File storage

Files are stored by the engine on disk under `data/files/<plural>/<id>/<name>`
and downloaded through the `:download` custom method on the owning resource.
They inherit the record's access scoping, and authentication is required. Back
up `data/` as a whole — the SQLite database and the blobs belong together.

## Testing

```bash
make test                                    # unit
make test-vm                                 # both tabs, end to end (VM tier)
```
