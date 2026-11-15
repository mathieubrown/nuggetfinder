# Supabase quotas and custom sign-in email

Accessed November 14, 2026. Confidence: high for published quotas, medium for real deliverability.

| Plan | Database | File storage | Egress |
|---|---:|---:|---:|
| Free | 500 MB | 1 GB | 5 GB uncached and 5 GB cached |
| Pro, starting at $25/month | 8 GB included | 100 GB included | 250 GB uncached and 250 GB cached |

The Data API returns at most 1,000 rows by default. Paginate requests and filter early. Supabase's built-in auth sender allows two emails per hour per project. A custom SMTP sender or send-email hook makes that rate configurable. [Supabase pricing](https://supabase.com/pricing) · [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) · [Supabase JavaScript select](https://supabase.com/docs/reference/javascript/select)

Resend lists a free allowance of 3,000 emails per month and 100 per day, and Pro at $20 for 50,000 emails per month. Postmark lists a 100-message developer tier and Basic at $15 for 10,000 monthly messages. Start pricing with Resend for the pilot and compare Postmark for a steady paid volume. Test delivery and magic links on the sender's verified domain before opening sign-ups. [Resend pricing](https://resend.com/pricing) · [Postmark pricing](https://postmarkapp.com/pricing)

Counsel questions: Which data processing agreements, retention settings and regions do we need for authentication email and logs?
