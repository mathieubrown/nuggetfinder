# Video hosting, transcription and moderation costs

Accessed November 14, 2026. Confidence: high for listed units, medium for forecasts. USD. Model one minute delivered per view and 1,000 unique minutes stored at 720p for a month. Encoding is included in the Cloudflare model and Mux Basic input is free. Taxes and human review are outside these figures.

| Monthly views | Cloudflare Stream | Mux Basic pay as you go |
|---:|---:|---:|
| 1,000 | $6 | $2.40 gross storage, $0 modeled net after credit |
| 10,000 | $15 | $2.40 gross storage, $0 modeled net after credit |
| 100,000 | $105 | $2.40 gross storage, $0 modeled net after credit |

Cloudflare charges $5 per 1,000 stored minutes and $1 per 1,000 delivered minutes. Mux lists 100,000 delivery minutes before charges and a $20 monthly credit on pay as you go, with Basic 720p storage starting at $0.0024/minute-month. The Mux free plan limits stored video count to ten. Longer watch time, higher quality, preloading and playback retries can change costs. [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/) · [Mux pricing](https://www.mux.com/pricing)

Transcription is billed per uploaded minute. OpenAI lists $0.003/minute for gpt-4o-mini-transcribe and $0.006 for gpt-4o-transcribe. The moderation endpoint is free at published rates. Budget separate paid LLM triage by input plus output tokens per minute. For example, a hypothetical $0.25/$2.00 per million-token rate with 500 input and 100 output tokens is $0.000325 per uploaded minute, excluding video frames and retries. [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)

A future server worker accepts upload IDs, requests captions, attaches a moderation label and confidence to the queue, and deletes transcripts after review. Set per-upload and monthly limits before enabling it.

Counsel questions: What notice and retention terms are required for media, caption transcripts and third-party moderation? Which review and child safety obligations apply before launch?
