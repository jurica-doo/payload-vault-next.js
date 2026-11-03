# Phase 6 — Round 2 test guide

Re-test after the fixes in migration `20261101130000_phase6_review_fixes` and the Kommunikation rework. Part A
re-checks every finding; Part B looks for new edge cases. Record new findings in
[r1-p6-verification.md](r1-p6-verification.md) as `P6-R2-xx`.

## Part A — fixes

| ID | Check |
|---|---|
| P6-01 | Paste a two-line subject into the editor: it becomes one line. Via the API (`rpc_save_template_draft` with `\r\n`) → „Der Betreff darf keinen Zeilenumbruch enthalten…“ |
| P6-02 | With one active birthday campaign, approve or resume another → toast „Kampagne nicht fortgesetzt / freigegeben“ with the reason |
| P6-03 | Duplicate template name (other case, trailing spaces), name „ab“, no legal basis → German toasts |
| P6-04 | Window: time pickers; start ≥ end shows the inline message; „Verwerfen“ restores the saved values |
| P6-05 | Each campaign and template action shows a success toast; „Kampagne abbrechen…“ lives in ⋯ and its confirm button says „Kampagne abbrechen“; double-clicking any button runs it once |
| P6-06 | Send log: status filter and pages come from the database (more than 200 entries reachable); K-number; German notes; full width |
| P6-07 | Block with reason „Beschwerde“, block again as „Unzustellbar“ → reason updated; search works; more than 500 entries reachable |
| P6-08 | Compliance without 2FA: every write button disabled |
| P6-09 | Chunked webhook body over 10 KB → 413 |
| P6-10 | `send-emails` response contains `unreported` |
| P6-11 | Customer with more than 50 automatic mails → „Die neuesten 50 von N Einträgen“ |
| P6-12 | Production import and block-list import with a Windows-1252 CSV containing „Müller“ → umlauts intact |
| P6-13 | Block-list import: template download, preview count, result with file line numbers; advisers have no access; compliance needs 2FA |

## Part B — new edge cases
- **Concurrency:** two people approve the same campaign at the same moment; two birthday campaigns approved in parallel by two admins (only one may end up active).
- **Import:**
  - a file with only a header
  - 10,001 rows
  - a 2 MB+ file
  - addresses with umlauts, uppercase and spaces
  - semicolon vs. comma delimiter
  - quoted fields
  - an `=HYPERLINK()` cell
  - an Excel export with an empty trailing column
- **Templates:**
  - 10,000-character body
  - emoji and RTL text in the subject
  - placeholders with spaces `{{ vorname }}`
  - editing someone else's draft (you become the author and can't approve it)
- **Lifecycle:**
  - cancel a paused campaign
  - lift a block during an active campaign, then plan again
  - withdraw consent after planning (the mail must not go out)
- **Sessions:** sign out in another tab, then click an action → „Sitzung abgelaufen“.
- **Accessibility:**
  - keyboard through ⋯ menus and the import dialog
  - screen-reader names of „Aufheben“ (includes the address)
  - focus after closing dialogs
- **Mobile 360 px:** campaign rows wrap cleanly, the import dialog is a sheet, the send log becomes cards.
