/**
 * Custom fetch wrapper that implements:
 * 1. Exponential backoff retry on network errors or 429 Rate Limits.
 * 2. Parsing the Retry-After header for rate limits.
 * 3. Standardized error object responses.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 1000
): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        if (attempt === retries) {
          return { error: 'Rate limit exceeded after maximum retries.', status: 429 };
        }
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoff * Math.pow(2, attempt);
        console.warn(`Rate limit hit (429). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (response.status === 401) {
        return { error: 'Unauthorized', status: 401 };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return { error: `HTTP ${response.status}: ${errorText}`, status: response.status };
      }

      return await response.json();
    } catch (error: any) {
      if (attempt === retries) {
        return { error: error.message || 'Network request failed.' };
      }
      const delay = backoff * Math.pow(2, attempt);
      console.warn(`Network error: ${error.message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
