import Ably from "ably";
import { HttpError } from "../errors.js";

/**
 * Ably channel used to synchronize a single canvas between active
 * workspace members. Channel names may contain ":" (only "*" is reserved
 * for capability wildcards), and are scoped per canvas so tokens can be
 * limited to exactly one room.
 */
export function canvasChannelName(canvasId: string): string {
  return `canvas:${canvasId}:collab`;
}

let restClient: Ably.Rest | null = null;

function getRestClient(): Ably.Rest {
  if (!restClient) {
    const key = process.env.ABLY_API_KEY;

    if (!key) {
      throw new HttpError(
        500,
        "ABLY_API_KEY environment variable is not configured"
      );
    }

    restClient = new Ably.Rest({ key });
  }

  return restClient;
}

/**
 * Mints a short-lived Ably token request for the given canvas.
 * The token is bound to the requesting user (clientId) and is limited to
 * publish/subscribe/presence on that single canvas's channel.
 */
export async function createCanvasTokenRequest(
  canvasId: string,
  userId: string
): Promise<Ably.TokenRequest> {
  const client = getRestClient();

  return client.auth.createTokenRequest({
    clientId: userId,
    ttl: 60 * 60 * 1000, // 1 hour
    capability: {
      [canvasChannelName(canvasId)]: ["publish", "subscribe", "presence"],
    },
  });
}
