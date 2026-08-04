import type { AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export interface CanvasContent {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UserSession {
  user: AuthUser | null;
  session: AuthSession | null;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

export interface SignOutResult {
  success: boolean;
}
