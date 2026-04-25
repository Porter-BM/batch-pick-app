// ─── Order List Query ────────────────────────────────────────────────────────
// Accepts a dynamic `query` variable so each tab can pass its own filter string

export const UNFULFILLED_ORDERS_QUERY = `
  query UnfulfilledOrders($query: String, $cursor: String) {
    orders(
      first: 50
      after: $cursor
      query: $query
      sortKey: CREATED_AT
      reverse: false
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          tags
          displayFulfillmentStatus
          shippingAddress {
            country
            countryCodeV2
            province
          }
          lineItems(first: 50) {
            edges {
              node {
                id
                title
                quantity
              }
            }
          }
          shippingLines(first: 5) {
            edges {
              node {
                title
                code
              }
            }
          }
        }
      }
    }
  }
`

// ─── Line Items + Variants + Metafields Query ────────────────────────────────

export const ORDER_LINE_ITEMS_QUERY = `
  query OrderLineItems($id: ID!) {
    order(id: $id) {
      id
      name
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            quantity
            variant {
              id
              title
              barcode
              metafield(namespace: "custom", key: "bin_name") {
                value
              }
            }
          }
        }
      }
    }
  }
`

// ─── Batch variant fetch by IDs ──────────────────────────────────────────────

export const VARIANTS_BY_IDS_QUERY = `
  query VariantsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        barcode
        metafield(namespace: "custom", key: "bin_name") {
          value
        }
      }
    }
  }
`
