export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const isGet = req.method === "GET";
  const qp = isGet
    ? req.query
    : (req.headers["content-type"] || "").includes("application/json")
    ? req.body
    : Object.fromEntries(new URLSearchParams(req.body || ""));

  const last_name = (qp?.last_name || "").toString();
  const postcode = (qp?.postcode || "").toString();
  const format = (qp?.format || "").toString().toLowerCase();

  if (!last_name || !postcode) {
    return respond(
      {
        status: "bad_request",
        message: "",
        html: fragment("Please enter both last name and postcode.", false),
      },
      res,
      format
    );
  }

  const last = last_name.trim().toLowerCase();
  const pc = postcode.trim().toUpperCase().replace(/[\s-]/g, "");

  try {
    const shop = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    const gql = `
      {
        orders(first: 250, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              name
              createdAt
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
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: gql }),
    });

    if (!api.ok) {
      return respond(
        {
          status: "api_error",
          message: "",
          html: fragment(`Shopify API error: ${api.status}`, false),
        },
        res,
        format
      );
    }

    const data = await api.json();
    const edges = data?.data?.orders?.edges || [];

    // 90-day window
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    let status = "not_found";
    let message = "";

    for (const { node } of edges) {
      const orderDate = new Date(node.createdAt);
      if (orderDate < ninetyDaysAgo) continue; // skip older than 90 days

      const shipLast = (node?.shippingAddress?.lastName || "")
        .toLowerCase()
        .trim();
      const shipZip = (node?.shippingAddress?.zip || "")
        .toUpperCase()
        .replace(/[\s-]/g, "");

      if (shipLast === last && shipZip === pc) {
        const candidate = node?.metafield?.value || node?.note || "";
        if (candidate) {
          status = "found_with_message";
          message = candidate;
        } else {
          status = "found_no_message";
          message = "";
        }
        break;
      }
    }

    let html;
    if (status === "found_with_message") {
      html = fragment(message, true);
    } else if (status === "found_no_message") {
      html = fragment("No gift message found for those details.", false);
    } else {
      html = fragment("No gift message found for those details.", false);
    }

    return respond({ status, message, html }, res, format);
  } catch (err) {
    console.error(err);
    return respond(
      {
        status: "server_error",
        message: "",
        html: fragment("Lookup failed. Please try again.", false),
      },
      res,
      format
    );
  }
}

function respond(payload, res, format) {
  if (format === "json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(200)
      .json({ status: payload.status, message: payload.message });
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(payload.html);
}

function fragment(msg, found) {
  return `
<div style="padding:16px;border:1px solid #e6e6e6;border-radius:12px;background:#fff">
  <h2 style="margin:0 0 8px;font-weight:700;color:#4b3f43">Gift message lookup</h2>
  ${
    found
      ? `<div style="white-space:pre-wrap;line-height:1.5">${escapeHtml(msg).replace(
          /\n/g,
          "<br>"
        )}</div>`
      : `<p style="margin:0;color:#666">${escapeHtml(msg)}</p>`
  }
</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}
