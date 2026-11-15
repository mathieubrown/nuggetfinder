# Video plan for review

Hold uploads until child safety escalation, policy review, moderation staffing and a spending cap are approved. Start with a 15-second recording target, a 30-second hard maximum and a 50 MB upload limit. Accept MP4 or MOV with H.264 video and AAC audio. Verify the actual container, tracks, duration and file size on the server. Reject invalid files before encoding.

## Upload and review

1. An authenticated, eligible account requests a short-lived upload URL. A server endpoint checks posting restrictions and quotas. Keep credentials on the server. Send the file to a private upload target and publish playback authorization only after review.
2. A worker checks the media and runs child safety hash matching with an approved provider. Restrict access to possible matches and use the documented escalation and reporting procedure. Use blurred and muted preview controls for moderators. Keep reports and legally required evidence under the approved retention policy.
3. Transcribe speech, then send the minimum necessary text to a risk service. Sample frames only when the text or another signal leaves a visual question. Clear low-risk items for auto-live, hide clear policy violations, and route ambiguous items to a human. AI may hide content. Only a human may ban an account.
4. Attach timed captions to approved playback and provide on/off controls. Moderators can correct captions. Delete raw moderation transcripts after review and keep only the approved caption track under the published retention policy. Define retention for hidden media and failed uploads before launch.

Use the NCMEC provider registration and test process before accepting media. Confirm hash-matching eligibility and pricing, reporting thresholds, evidence handling and preservation with counsel. See [child safety research](research/child-safety.md).

## Hosting and monthly cost

Compare Cloudflare Stream and Mux Basic for private uploads, signed HLS playback, caption tracks and provider-side encoding. Recheck provider terms before choosing. For a 15-second clip watched in full, assume one-quarter delivery minute per view and 1,000 stored and newly processed minutes per month. Use the researched rates of $0.003/minute for transcription and a modeled $0.000325/minute for transcript risk triage.

| Monthly views | Delivered minutes | Cloudflare hosting | Mux Basic modeled hosting after credit | Transcription and text triage |
|---:|---:|---:|---:|---:|
| 1,000 | 250 | $5.25 | $0 | $3.33 |
| 10,000 | 2,500 | $7.50 | $0 | $3.33 |
| 100,000 | 25,000 | $30.00 | $0 | $3.33 |

Mux gross storage in this model is $2.40 before the monthly credit. Estimates exclude repeat processing, frames, hash-matching fees and human review. Get quotes for those items before setting the cap. [Pricing sources and assumptions](research/video-costs.md)

## Build order

1. Confirm safety reporting, vendor contracts, retention and monthly caps.
2. Build private upload and validation with a test account and fixture files.
3. Add hash matching, captions, risk triage and the review queue. Test escalation with synthetic fixtures.
4. Enable signed playback for approved clips and test accessibility, deletion and appeals.
5. Pilot with invited users after approval.
