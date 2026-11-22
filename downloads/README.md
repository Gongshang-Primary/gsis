# Deploy frontend hotfix download

Model: Codex. This branch adds a download copy only; product source is unchanged from `1483c631000468201f4a739624b7a8ed4a95b61f` (PR #247).

`Deploy_Frontend_1483c631.zip` is byte-identical to the verified package supplied on 20 November 2026. No rebuild, new release or deployment is performed by this delivery commit.

Deploy frontend only. No backend, standalone Worker, settings or database change.

Before refreshing an old Deploy tab, copy down unsaved assignment selections. The old frontend does not retain every unsent assignment edit across a reload. Keep browser storage, which holds pending-command evidence.

After the owner updates the existing Deploy Pages site, refresh and use Retry save. The owner controls deployment. Rollback uses the prior frontend deployment.

Source validation: 1,088 local v0.9 test programs, 40 LORD programs and all 5 CI jobs passed at the source head. CI run: 44745605887. The additional full local v1 run was not claimed as passing.
