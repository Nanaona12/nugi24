# Closing cashier
- [x] Exit to sign-in immediately after successful closing, without reopening a new shift. Verified using a real cashier sign-in and temporary shift; local identity cleared.
- [ ] Replace denomination counting with arbitrary amounts and optional temporary notes; verify Rp150,000 + Rp20,000 + Rp30,000 = Rp200,000 and application to physical cash.

# MySQL Backup
- [x] Add permanent tenant journal, initial business snapshots, and owner-managed encrypted device access.
- [x] Add Backup MySQL controls and downloadable local sync package with setup/scheduling instructions.
- [x] Test insert/update/delete retention, retry/offline recovery, denied access, and local MySQL readback. Full sync resumed after interruption and retained 21,363 versions; repeat sync did not duplicate. Test devices revoked.
- [ ] Verify the user's own computer connection after installation (requires their computer).

# AI Admin
- [x] Persist one owner-only conversation with private attachments.
- [x] Add streaming agent tools for profit, suppliers, products, and confirmation-gated PO drafts.
- [x] Add photo/text/voice chat page and owner navigation.
- [x] Verify profit, private photo upload, approval, duplicate-approval recovery, history reload, transcription endpoint, unauthenticated/foreign conversation rejection, and desktop UI. Seven domain tests passed; automatic build passed. Synthetic PO, chat, and attachment removed.
- [x] Verify browser microphone recording and transcript-to-composer using a synthetic audio device; no page errors.
- [ ] Verify cashier session denial end-to-end and physical microphone/browser permissions on a real device; server owner checks and cashier route allow-list are enforced.