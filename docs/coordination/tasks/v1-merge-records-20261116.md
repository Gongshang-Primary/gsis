# v1-merge-records-20261116: amended chain merge inventory

- Status: documented; local verification passed; exact-head CI and Claude review pending. Part A/B merges are complete; Part C new-head verification/rechecks remain separate gates.
- Owner/model: Codex; coordinator ChatGPT v1; independent exact-head reviewer Claude.
- Last updated (Asia/Singapore): 16 November 2026, 01:12.
- Branch: `codex/v1-merge-records-20261116`.
- Refreshed base: `334731cdb1d4fc5d37d7bdf6de761d668c062994`.
- Current head/PR: recorded in the publication PR, avoiding a self-referential hash.
- Authority: owner's Part D bookkeeping instruction and latest amendment to record all eleven PR165–175 heads with the single PR175 carrying merge. WORKFLOW review/integration step 5 requires merged claims to be closed with evidence.
- Out of scope: application/test/build/workflow/configuration changes; rewriting historical evidence; resolution of PR178's task conflict; edits to PR176/178/157-owned files; deployment, migration, provider sends or live data.

## Exact documentation scope

```text
docs/coordination/tasks/v1-merge-records-20261116.md
docs/coordination/tasks/v1-merge-records-20261115.md
docs/v1/accelerated-delivery/CHANGELOG_2026-11-15.md
docs/coordination/tasks/v1-contacts-policy-update.md
docs/coordination/tasks/v1-accelerated-spec-20261113.md
docs/coordination/tasks/v1-contacts-save-recovery.md
docs/coordination/tasks/v1-deploy-fortnight-editor.md
docs/coordination/tasks/v1-deploy-asc-subject-identity.md
docs/coordination/tasks/v1-lord-cart-groups.md
docs/coordination/tasks/v1-deploy-save-recovery.md
docs/coordination/tasks/v1-deploy-venue-uses.md
docs/coordination/tasks/v1-deploy-venue-source-fence-budget.md
docs/coordination/tasks/v1-venues-subpath-navigation.md
docs/coordination/tasks/v1-roster-admin-settings.md
docs/coordination/tasks/v1-contacts-projection.md
docs/coordination/tasks/v1-contacts-classification-roundtrip.md
docs/coordination/tasks/v1-global-save-status.md
```

Refresh main, all heads and actual files in all three open PRs before claiming. PR176 owns its forty implementation paths, PR178 its three test/task paths and PR157 only OWNER_DIRECTIVES; none overlaps these seventeen documentation paths. Publish only this claim through the expected-head, non-force main exception, then branch from the accepted claim. Re-read active claims before edits. Same builder retains the merged tasks; only their current status and a dated merge-evidence note change. Preserve their previous implementation/test narratives verbatim.

## Decisions and acceptance

Record Part A's four merges and the eleven reviewed chain heads. All eleven chain entries use `334731cdb1d4fc5d37d7bdf6de761d668c062994`, not separate child merges. #165 was marked merged by GitHub; #166–174 were closed with carrying-commit notes. Preserve their branches/heads. Record tested tree `d3f24176b859c6dc3fb10388adfa490a727d0c73`, merged main tree `f0b0d0892ddd61aceaccb97ff16d8c3cbb0893f0`, and the two review-document-only differences. Keep the previous eight inventory entries and prior dated checkpoints intact. Also record the separately approved PR157 directive merge after the chain comparison; it adds one documentation row and no product changes.

Record Part C outcomes honestly: PR176's mechanical integration head `de4d2834bbd6391db4a0df291c941770b3d9233f` now passes both CI workflows and all 97 local product programs, but needs Claude's recheck. PR178's initial rebase stopped on its task record and was aborted; the owner then explicitly approved retaining the exact reviewed record. The completed rebase plus N2 guard is `530a7add936a168184becaaacb82a24deaf5da18`, based on `fa6666b3f846dfc10bebfe47e5a10ed9a264b0ed`, with a clean-head 24.507-second focused pass. Fresh CI and Claude recheck remain required. This bookkeeping cannot approve either implementation. Do not close either active claim or merge them through this documentation PR.

## Verification

Validate exact seventeen-document scope, whitespace, relative links, every inventory head's ancestry in its carrying merge, each actual merge's parents/automatic tree, and the no-product-difference proof. Check status notes against current PRs and pinned review records. Include reproducible verification commands in the task/PR and actual outcomes; application suites are not required locally for prose-only updates. Existing exact-head CI and Claude review remain publication gates. No optional skill package execution is claimed.

## Deployment and handoff

Not deployed. Documentation rollback changes records only; it does not undo any already-merged code. Preserve PR176 C-1 Memberships and C-2 immediate pre-deployment Contacts D1 backup as separate owner gates. F5 remains **OPEN**. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. Publish one bounded bookkeeping PR for Claude; do not confuse claims, review, merge, deployment and hosted proof.

## Accepted claim and implementation checkpoint

Accepted task-only main claim: `fa6666b3f846dfc10bebfe47e5a10ed9a264b0ed`. Re-read after publication; this branch starts at that exact commit. The seventeen-path update closes fifteen merged task records, preserves the earlier eight inventory entries and adds the fifteen Part A/B entries and the subsequently completed PR157 directive merge. The master changelog gains a dated status checkpoint. PR176/178 task files and all review/owner-directive records are untouched.

### Reproducible documentation verification

Run from the repository root with `TZ=Asia/Singapore`. This checks the actual inventory and Git objects, not application behavior.

```python
from pathlib import Path
import re,subprocess,urllib.parse
root=Path.cwd()
base='fa6666b3f846dfc10bebfe47e5a10ed9a264b0ed'
claim=Path('docs/coordination/tasks/v1-merge-records-20261116.md')
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
allowed=set(re.search(r'```text\n(.*?)\n```',claim.read_text(),re.S).group(1).splitlines())
changed=set(git('diff','--name-only',base).splitlines())
assert changed==allowed,(changed-allowed,allowed-changed)
assert all(p.startswith('docs/') for p in changed)
inventory=Path('docs/coordination/tasks/v1-merge-records-20261115.md').read_text()
rows=re.findall(r'\| \[#(\d+)\]\([^\n]+?\) \| `([0-9a-f]{40})` \| `([0-9a-f]{40})` \|',inventory)
assert len(rows)==24 and len({p for p,_,_ in rows})==24
carrier='334731cdb1d4fc5d37d7bdf6de761d668c062994'
for pr,head,merge in rows:
    subprocess.run(['git','merge-base','--is-ancestor',head,merge],check=True)
    if 165<=int(pr)<=175:assert merge==carrier
for merge in {m for _,_,m in rows}:
    parents=git('show','-s','--format=%P',merge).split()
    assert len(parents)==2
    assert git('merge-tree','--write-tree',*parents)==git('rev-parse',merge+'^{tree}')
assert git('rev-parse',carrier+'^{tree}')=='f0b0d0892ddd61aceaccb97ff16d8c3cbb0893f0'
assert git('diff','--name-only','d3f24176b859c6dc3fb10388adfa490a727d0c73',carrier).splitlines()==['docs/coordination/review/v1-pr157-codex-review.md','docs/coordination/review/v1-pr175-chain-claude-recheck.md']
links=0
for p in changed:
    text=Path(p).read_text()
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',text):
        if re.match(r'^[a-zA-Z]+:',target) or target.startswith('#'):continue
        local=urllib.parse.unquote(target.split('#')[0])
        assert (root/p).parent.joinpath(local).exists(),(p,target)
        links+=1
    if p!=str(claim):
        delta=git('diff','--unified=0',base,'--',p)
        removed=[s[1:] for s in delta.splitlines() if s.startswith('-') and not s.startswith('---')]
        assert all(re.match(r'^(?:- )?Status:',s) for s in removed),(p,removed)
subprocess.run(['git','diff','--check',base],check=True)
print(f'PASS: {len(changed)} documentation paths; {len(rows)} inventory entries; 14 automatic merge trees; identical product tree; {links} local links; historical prose retained; whitespace clean.')
```

Actual result: **PASS**, seventeen documentation paths, 24 distinct inventory entries, fourteen automatic merge trees, identical product tree, thirty local links, historical prose retained and whitespace clean. The command was `TZ=Asia/Singapore python3 /tmp/gsis-verify-merge-records.py`, whose complete source is preserved above for reproducibility. No local application build or Node/LORD suite is repeated for this documentation-only change. Fresh branch CI and Claude exact-head review remain separate; no earlier approval transfers to this bookkeeping head. Rollback affects records only.

The additional PR157 entry follows its successful exact-head CI and independent Codex review of the Claude-authored row. New main is `5ae81158f12c8131f4657e4ce77055d008bd6419`; it changes no product path. Part C also passed one unpublished combined-tree probe at `97701d7ce8f9bc0214cbc18e639cd5ddeac05278` (22.944s, 397 bindings, 29 known gaps, fifteen pins). This is supplementary synthetic compatibility evidence, not a replacement for either exact-head CI/review or a full combined-suite/hosted result.
