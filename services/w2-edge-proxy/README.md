# W2 edge bridge

This static Netlify deploy serves the NeoLoop Feishu workbench at
`https://shiting-neoloop-w2-edge.netlify.app/` and proxies the same-origin
`/api/*` surface to the private Cloudflare gateway deployment. The proxy exists
because the Feishu workflow runtime and direct mainland browser connections
cannot reliably reach the `workers.dev` hostname.

The bridge stores no credential, request, or response. The gateway remains the
only component that authenticates Owner sessions and W2 bearer requests,
rereads Base records, validates candidates, manages connector state, and
appends AI audit rows. The workbench assets contain no Owner credential and
fail closed outside the Feishu Base SDK host.

The Cloudflare Worker is configured with the non-secret public origin
`https://shiting-neoloop-w2-edge.netlify.app`. Browser OAuth therefore uses the
Netlify callback URL even though Netlify forwards the request to `workers.dev`.
The Feishu application redirect allowlist must contain exactly:

```text
https://shiting-neoloop-w2-edge.netlify.app/api/v1/session/callback
```

Updating this bridge does not rotate or copy the Worker secrets and does not
replace the existing Durable Object.
