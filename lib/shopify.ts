const API_VERSION = '2025-01'

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface GraphQLResponse<T> {
  data?: T
  errors?: { message: string }[]
  extensions?: {
    cost?: {
      requestedQueryCost: number
      actualQueryCost: number
      throttleStatus: {
        maximumAvailable: number
        currentlyAvailable: number
        restoreRate: number
      }
    }
  }
}

export async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
  retries = 3
): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_TOKEN

  if (!domain || !token) {
    throw new Error('Missing Shopify environment variables')
  }

  const endpoint = `https://${domain}/admin/api/${API_VERSION}/graphql.json`

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      throw new Error(`Shopify API HTTP error: ${response.status}`)
    }

    const json: GraphQLResponse<T> = await response.json()

    if (json.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${json.errors[0].message}`)
    }

    const throttle = json.extensions?.cost?.throttleStatus
    if (throttle && throttle.currentlyAvailable < 100) {
      const waitMs = Math.ceil((100 - throttle.currentlyAvailable) / throttle.restoreRate) * 1000
      console.warn(`Shopify rate limit low — waiting ${waitMs}ms`)
      await sleep(Math.min(waitMs, 10000))
    }

    if (!json.data) {
      throw new Error('Shopify returned empty data')
    }

    return json.data
  }

  throw new Error('Shopify API: max retries exceeded')
}
