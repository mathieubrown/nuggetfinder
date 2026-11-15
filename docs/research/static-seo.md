# Static SEO and share previews

Accessed November 14, 2026. Confidence: high for published limits, medium for cost and effort estimates.

Preview crawlers need an HTTP URL for each public object, with a title, canonical URL, description and Open Graph image in the first HTML response. Hash routes share one HTTP URL. Put stable spot, take and Beef paths in a sitemap and update or remove previews when moderation changes a take. [Google JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) · [Open Graph protocol](https://ogp.me/)

| Option | Estimated initial work | Cost and limits |
|---|---|---|
| GitHub Pages plus scheduled Actions | 1 to 2 days | Public Pages can start at $0. Published site max 1 GB, soft 100 GB/month bandwidth, deployments time out after 10 minutes. Check commercial hosting terms and freshness expectations. |
| Cloudflare Pages with Functions | 2 to 3 days | Free tier for small traffic. Pages lists 500 builds/month and up to 20,000 files per free deployment. Dynamic requests use Workers limits and paid usage can apply. |
| Netlify with edge functions | 2 to 3 days | Free includes 300 monthly credits. Personal is $9/month for 1,000 credits. Deploys, bandwidth, requests and compute can consume credits. Model traffic before selecting a plan. |

[GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) · [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) · [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Netlify pricing](https://www.netlify.com/pricing/) · [Netlify credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)

Counsel questions: Which user content can appear in public preview images? How promptly should removals propagate to publisher-controlled previews and third-party caches?
