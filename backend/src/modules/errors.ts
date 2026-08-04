import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  status: ContentfulStatusCode;

  constructor(status: ContentfulStatusCode, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}
