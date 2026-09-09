# Webhook NULL root-cause report

## Scope

This audit covers only `POST /api/google-form/webhook`. It does not change the
Google Form or Google Apps Script.

## Findings before remediation

The current webhook source does **not** contain a field-alias mismatch for the
three reported questions:

- `ROOM AVAILABILITY (DATE)` is explicitly requested and is written to both
  `availability_date` and `preferred_date`.
- `ROOM AVAILABILITY (TIME)` is explicitly requested and is written to both
  `availability_time` and `preferred_time`.
- `REQUEST FOR ROOM ACCESS DUE TO TENANT'S UNAVAILABILITY` is explicitly
  requested. Smart and straight apostrophes normalize to the same lookup key,
  and the normalized answer is written to `room_access_permission`.

The webhook reads both a flattened request object and the native
`namedValues` object. Arrays from `namedValues` are converted to text before
date, time, and permission normalization.

There is also no successful insert path in the current webhook that converts
any of the three fields to `null`. If date, time, or access normalization
returns `null`, the handler returns HTTP 400 before calling Supabase. On the
successful path, all three normalized values are included in the insert
object.

Therefore, the reported database state cannot have been produced by the
currently checked-in webhook's successful insert path. This is a bounded
conclusion from the source, not a guess about the deployed environment. A live
request trace is required to distinguish a stale deployed webhook from a
database-side process or a different writer.

One historical database-side mutation is proven in the repository:
`202609080001_appointment_room_access.sql` explicitly sets
`room_access_permission = null` for legacy Google Form answers outside its old
enumeration. That statement explains legacy NULL access permission values, but
it does not set either availability field to NULL and therefore cannot, by
itself, explain all three reported NULLs.

## Diagnostic trace added (no data-path fix)

For the next invocation, the webhook now logs, in order:

1. The exact raw request body before JSON parsing.
2. A JSON object containing the normalized values under the exact three Google
   Form question labels.
3. The exact object immediately before it is passed to
   `supabase.from("complaints").insert(payload)`.

These three records establish the first point at which a value differs without
changing aliases, normalization, validation, database writes, or Apps Script.
