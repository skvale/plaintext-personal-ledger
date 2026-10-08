import { deserialize } from '$app/forms';

/**
 * Parse a raw `fetch('?/action')` response into the action's `data` payload.
 * SvelteKit 3 serializes action data with devalue, so `JSON.parse(body.data)`
 * yields the devalue index array rather than the payload — use this instead.
 */
export async function actionData(res: Response): Promise<any> {
  try {
    const result = deserialize(await res.text());
    if (result.type === 'error') return null;
    return (result as { data?: any }).data ?? null;
  } catch {
    return null;
  }
}
