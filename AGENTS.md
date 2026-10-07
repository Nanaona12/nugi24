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
- Admin AI uses one tenant-scoped, owner-only persisted UIMessage conversation and user-scoped server clients; database-locked draft approval is the only PO write path to prevent forged tool approvals and duplicate purchases.
- Admin AI streaming and transcription use TanStack server routes with bearer verification; model/provider setup remains server-only and existing standalone AI features are not migrated implicitly.
