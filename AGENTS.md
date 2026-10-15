<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Product codes are unique within a tenant, not globally, because each store owns an independent catalog and Excel imports must never target another store's row.
- Deleting a catalog product must preserve transaction item snapshots and financial history; transaction_items.product_id uses ON DELETE SET NULL so old receipts remain readable.
- Local MySQL backup uses a sanitized, append-only Cloud business journal with transactionally serialized tenant counters; offline clients only insert immutable versions and never propagate deletions. Device access is owner-approved, revocable, and encrypted to a locally generated public key; MySQL credentials never leave the computer.
- Admin AI uses one tenant-scoped, owner-only persisted UIMessage conversation and user-scoped server clients; database-locked draft approval is the only PO write path to prevent forged tool approvals and duplicate purchases.
- Admin AI streaming and transcription use TanStack server routes with bearer verification; model/provider setup remains server-only and existing standalone AI features are not migrated implicitly.
- Closing cash counting is a browser-only sum of arbitrary amounts with optional temporary notes that fills the existing physical-cash input without extra ledger entries; after closing, keep synchronization paused while showing the closing report plus all shift receipts, then exit through the shared local sign-out flow only when the cashier finishes reviewing it.
- PO creation uses one responsive grouped item editor with shrinkable grid tracks instead of a wide desktop-only table, so all item fields remain accessible without horizontal scrolling on any device.
- Loyalty rewards are written only via an insert trigger on customer_rewards that deducts points and posts the bookkeeping entry, so points and ledger cannot drift apart.
