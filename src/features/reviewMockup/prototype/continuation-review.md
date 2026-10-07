# Mockup continuation review — support and photos

This continuation repairs defects found after the earlier broad walkthrough. It supersedes the current-source claim in [completion-review.md](completion-review.md); that report and its broad browser records remain historical evidence.

## Candidate and ownership

- Owner: this chat; `codex/mockup-workflow-fixes`, isolated owned worktree. Primary checkout preserved.
- Baseline: `fd9ff9f51a74c297b1919ef4766808a010272272`.
- Final candidate: `6e7041f29cbb1035ca098647a61082c6cbfa87f0`; HTML source: `5372a359f9a33be33a95582b550371cc53a5803c`.
- HTML SHA256: `b1fc89f7f8dd37f15f033df237b2bc630b3cd23c9312c1260fa9787a471c8bd1`.
- Diff fingerprint: `d16476b1927a238318ad7126ae7deb5bc6d84d60`.
- Authorized: continue coherent local mockup behavior. Standard risk: synthetic in-memory UI; no real support delivery, permissions, payments or media.

## Observable repairs

| Workflow | Before | After and proof |
| --- | --- | --- |
| Admin support draft | June's unsent Mara reply appeared in Evelyn's request. | Requester and request scoped drafts; switch away/back preserves exact recipient and conversation. |
| Conversation history | Each new question replaced prior history; later answers erased earlier support replies. | Separate requests and chooser; chronological replies and resolution transitions remain visible to both roles. Earlier unfinished drafts stay with their own request. |
| Current status | Submitted Resolved became a stale draft and silently reclosed a reopened request. | Empty submitted composers do not retain status; requester changes invalidate stale status without erasing unsent reply text. |
| Personal support | June's own Help submission inherited reviewed Mara context. | Personal Help and reviewed conversations use separate acting/reviewed account contexts. Visitor requires sign-in; Alex and Evelyn see their own histories. |
| Audit | Replies to different Mara questions produced indistinguishable records tied to the selected store. | Requester plus request number; no message content; explicit support context. |
| Submission/recovery | Blank messages could submit and filled composers remained after success. | Reject blank messages; clear submitted composers; offline/failed/expired states keep text and do not claim submission. Escape user text in history. |
| Cover/gallery replacement | Replace behaved as Add and consumed a gallery place. | Exact cover/gallery target; replacement keeps usage unchanged, including at five used; additions consume one place and reject over-capacity. |
| Rights and pending review | Next image inherited previous completed rights confirmations. | Successful submission clears its confirmations; unfinished per-target drafts persist. Approved images stay live while pending; protect slot identity from removal during review. |
| Approved photo readback | Approval updated a count while cards/overview/enlargement retained old or generic image metadata. | Approved asset and alt reach owner photos/overview, discovery cards, public details/gallery and enlarged selected image. Pending photo remains scoped to its store. |

Existing Browse composition and CSS remain unchanged. Existing repository image assets supply the fictional sample. No new price, paid capacity, legal term or service promise was invented.

## Verification and review

- **25 regression tests pass**, including 390 fresh source presentations over all 78 routes and five roles. These are source/function checks, not a fresh browser matrix.
- **81 passing focused browser assertions:** 45 support, 36 photos. Support explicitly exercises all five roles; photo uses a staged approved owner then actual submission/review/public actions.
- **15 responsive presentations** at 320/390/1280px across Support, Admin Support, Owner Photos, Public Gallery and Photo Upload. No document overflow or measured main task control below 48px.
- Both independent Spec and Standards reviews are clean at their exact final candidates. Review findings were reproduced and repaired rather than waived.
- Detector returned `[]`; warning/error logs empty. Detector is not accessibility certification. Git whitespace checks pass.
- One mistakenly tautological browser bookkeeping assertion was excluded; a separate transcript-order assertion supplies the real proof. A guide-link attempt using stale visited wording timed out, was inspected and corrected. Neither is counted as a pass.

Support browser proof was captured at `7059ca5f`; the photo-only changes preserve support functions, handlers, relevant draft branches and CSS exactly. Explicit equality checks in [verification-support.json](verification-support.json) carry that unaffected evidence forward. Photo browser proof and all 25 regressions ran at the final candidate. Earlier390browser/78 mobile/21 responsive records are historical and are not relabeled as newly rerun.

## Evidence and remaining boundaries

[Current receipt](verification.json) · [Support browser evidence](verification-support.json) · [Photo browser evidence](verification-photo.json) · [Regression runner](regression.test.mjs) · [Local mockup](http://127.0.0.1:4187/full-site.html).

Screenshots: `mockup-support/desktop-support.png`, `mockup-support/320-admin-support.png`, `mockup-photo/desktop-photos.png` under this chat's visualization artifact directory.

This is focused proof for repaired connections, not an exhaustive clean audit of every control. Reticle was unavailable; supported browser controls supplied direct readback, without installation/configuration changes. Physical touch, Safari/Firefox, actual 200 percent browser zoom and screen readers remain untested. Real support delivery, photo upload/processing/moderation infrastructure, durable accounts/privacy, maps and billing remain simulated. Reload resets fictional data. Commercial decisions remain explicit and non-purchasable. No external publication or deployment occurred.
