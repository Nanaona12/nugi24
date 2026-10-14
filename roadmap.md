# Closing cashier
- [x] Keep the completed closing result open for review, include the closing report and all shift receipts in one printable PDF, then exit to sign-in only after the cashier finishes; verified with two temporary receipts including saved unit details, and all test data was removed.
- [x] Replace denomination counting with arbitrary amounts and optional temporary notes. Four tests passed; authenticated closing dialog verified Rp200,000 total, apply, edit, delete, reset, and note retention on collapse without closing the existing shift.

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