import Ably from "ably";
import { HttpError } from "../errors.js";

/**
 * Scene channel: element deltas, join snapshots, and presence (avatars).
 * Cursor channel: high-frequency pointer packets.
 *
 * Split so pointer traffic cannot stall strokes against Ably's default
 * 50 messages/sec per-channel limit. Channel names may contain ":"
 * (only "*" is reserved for capability wildcards).
 */
export function canvasSceneChannelName(canvasId: string): string {
  return `canvas:${canvasId}:scene`;
}

export function canvasCursorChannelName(canvasId: string): string {
  return `canvas:${canvasId}:cursors`;
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
 * the scene + cursor channels for that canvas only.
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
      [canvasSceneChannelName(canvasId)]: ["publish", "subscribe", "presence"],
      [canvasCursorChannelName(canvasId)]: ["publish", "subscribe"],
    },
  });
}
