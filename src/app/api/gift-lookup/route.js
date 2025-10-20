export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const last_name = searchParams.get("last_name");
  const postcode = searchParams.get("postcode");

  if (!last_name || !postcode) {
    return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
  }

  try {
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({
          query: `
            query {
              orders(first: 50, sortKey: CREATED_AT, reverse: true) {
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
          `,
        }),
      }
    );

    const data = await response.json();
    let message = null;

    data.data.orders.edges.forEach(({ node }) => {
      const matchName =
        node.shippingAddress?.lastName?.toLowerCase().trim() === last_name.toLowerCase().trim();
      const matchPost =
        node.shippingAddress?.zip?.replace(/\s+/g, "").toUpperCase() ===
        postcode.replace(/\s+/g, "").toUpperCase();

      if (matchName && matchPost) {
        message = node.metafield?.value || node.note || null;
      }
    });

    return new Response(
      JSON.stringify(
        message
          ? { message }
          : { message: "No gift message found for those details." }
      ),
      { status: 200 }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
  }
}
