import { HttpError } from "../errors.js";

let busy = false;

export function acquireAiLock(): () => void {
  if (busy) {
    throw new HttpError(429, "Another AI request is in progress. Try again in a moment.");
  }
  busy = true;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      busy = false;
    }
  };
}
