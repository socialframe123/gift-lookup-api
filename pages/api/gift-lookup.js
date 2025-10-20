export default async function handler(req, res) {
  // Allow your Shopify page to call this API
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const last_name =
    (req.method === "GET" ? req.query.last_name : req.body?.last_name) || "";
  const postcode =
    (req.method === "GET" ? req.query.postcode : req.body?.postcode) || "";

  if (!last_name || !postcode) {
    return res.status(400).send(fragment("Please enter both last name and postcode.", false));
  }

  const last = String(last_name).trim().toLowerCase();
  const pc   = String(postcode).trim().toUpperCase().replace(/[\s-]/g, "");

  try {
    const shop  = process.env.SHOPIFY_STORE_DOMAIN;   // e.g. your-store.myshopify.com (no https)
    const token = process.env.SHOPIFY_ADMIN_TOKEN;    // shpat_...

    const gql = `
      {
        orders(first: 200, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              name
              note
              shippingAddress { lastName zip }
              metafield(namespace: "gift", key: "message") { value }
            }
          }
        }
      }
    `;

    const api = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token
      },
      body: JSON.stringify({ query: gql })
    });

    if (!api.ok) {
      return res.status(502).send(fragment(`Shopify API error: ${api.status}`, false));
    }

    const data = await api.json();
    const edges = data?.data?.orders?.edges || [];

    let message = "";

    for (const { node } of edges) {
      const shipLast = (node?.shippingAddress?.lastName || "").toLowerCase().trim();
      const shipZip  = (node?.shippingAddress?.zip || "").toUpperCase().replace(/[\s-]/g, "");
      if (shipLast === last && shipZip === pc) {
        message = node?.metafield?.value || node?.note || "";
        break;
      }
    }

    const html = message
      ? fragment(message, true)
      : fragment("No gift message found for those details.", false);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(html);

  } catch (err) {
    console.error(err);
    return res.status(500).send(fragment("Lookup failed. Please try again.", false));
  }
}

function fragment(msg, found) {
  return `
<div class="gift-result-card" style="padding:16px;border:1px solid #e6e6e6;border-radius:12px;background:#fff">
  <h2 style="margin:0 0 8px;font-weight:700">Gift message lookup</h2>
  ${
    found
      ? `<div style="white-space:pre-wrap;line-height:1.5">${escapeHtml(msg).replace(/\n/g,"<br>")}</div>`
      : `<p style="margin:0;color:#666">${escapeHtml(msg)}</p>`
  }
</div>`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]))}
