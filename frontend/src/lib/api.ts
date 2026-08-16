import type {
  AuthResult,
  CanvasContent,
  SignOutResult,
  UserSession,
} from "./types";

const API_BASE_URL = "";

export interface Workspace {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  canvasesCount?: number;
  isOwner?: boolean;
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  image?: string | null;
  role: "owner" | "member";
  addedAt?: string | null;
}

export interface Canvas {
  id: string;
  name: string;
  workspaceId: string;
  userId: string;
  content?: string | CanvasContent | null;
  contentSeq?: number;
  createdAt: string;
  updatedAt: string;
}

// A scene change broadcast over the HTTP sync path. Mirrors the shape of the
// realtime (Ably) SceneMessage minus chunking, which is unnecessary over HTTP.
export interface CanvasDelta {
  elements: unknown[];
  sceneVersion: number;
  full: boolean;
}

export interface CanvasDeltaEnvelope {
  seq: number;
  elements: unknown[];
  sceneVersion: number;
  full: boolean;
}

export interface SyncPollResult {
  deltas: CanvasDeltaEnvelope[];
  latestSeq: number;
}

// Signed Ably token request returned by GET /api/canvases/:id/ably-token.
// Consumed by the Ably client via authCallback to join the canvas's realtime channel.
// Mirrors ably-js's TokenRequest: `capability` is a JSON-encoded string.
export interface AblyTokenRequest {
  keyName: string;
  ttl?: number;
  capability: string;
  clientId?: string;
  timestamp: number;
  nonce: string;
  mac: string;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Pass cookies for Better Auth session
  });

  if (!response.ok) {
    let errorMessage: string;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || response.statusText;
    } catch {
      errorMessage = response.statusText;
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

// Auth API Methods (Better Auth REST Endpoints)
export const authApi = {
  async getSession(): Promise<UserSession> {
    try {
      const data = await request<UserSession>("/api/auth/get-session");
      return data;
    } catch {
      return { user: null, session: null };
    }
  },

  async signIn(email: string, password: string, rememberMe = false): Promise<AuthResult> {
    return request("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password, rememberMe }),
    });
  },

  async signUp(name: string, email: string, password: string): Promise<AuthResult> {
    return request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  async signOut(): Promise<SignOutResult> {
    return request("/api/auth/sign-out", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};

// Workspace API Methods
export const workspaceApi = {
  async getAll(): Promise<Workspace[]> {
    return request<Workspace[]>("/api/workspaces");
  },

  async getById(id: string): Promise<Workspace> {
    return request<Workspace>(`/api/workspaces/${id}`);
  },

  async create(name: string): Promise<Workspace> {
    return request<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async update(id: string, name: string): Promise<Workspace> {
    return request<Workspace>(`/api/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  async delete(id: string): Promise<Workspace> {
    return request<Workspace>(`/api/workspaces/${id}`, {
      method: "DELETE",
    });
  },

  async getMembers(id: string): Promise<WorkspaceMember[]> {
    return request<WorkspaceMember[]>(`/api/workspaces/${id}/members`);
  },

  async addMember(id: string, email: string): Promise<WorkspaceMember> {
    return request<WorkspaceMember>(`/api/workspaces/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async removeMember(id: string, userId: string): Promise<WorkspaceMember> {
    return request<WorkspaceMember>(`/api/workspaces/${id}/members/${userId}`, {
      method: "DELETE",
    });
  },
};

// Canvas API Methods
export const canvasApi = {
  async getByWorkspace(workspaceId: string): Promise<Canvas[]> {
    return request<Canvas[]>(`/api/canvases/workspace/${workspaceId}`);
  },

  async getById(id: string): Promise<Canvas> {
    return request<Canvas>(`/api/canvases/${id}`);
  },

  async create(name: string, workspaceId: string): Promise<Canvas> {
    return request<Canvas>("/api/canvases", {
      method: "POST",
      body: JSON.stringify({ name, workspaceId }),
    });
  },

  async update(id: string, name: string): Promise<Canvas> {
    return request<Canvas>(`/api/canvases/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  async updateContent(id: string, content: CanvasContent | string): Promise<Canvas> {
    return request<Canvas>(`/api/canvases/${id}/content`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
  },

  async delete(id: string): Promise<Canvas> {
    return request<Canvas>(`/api/canvases/${id}`, {
      method: "DELETE",
    });
  },

  async getAblyToken(id: string): Promise<AblyTokenRequest> {
    return request<AblyTokenRequest>(`/api/canvases/${id}/ably-token`);
  },

  async postDelta(id: string, delta: CanvasDelta): Promise<{ seq: number }> {
    return request(`/api/canvases/${id}/sync`, {
      method: "POST",
      body: JSON.stringify(delta),
    });
  },

  async getDeltas(id: string, after: number): Promise<SyncPollResult> {
    return request<SyncPollResult>(
      `/api/canvases/${id}/sync?after=${encodeURIComponent(after)}`
    );
  },
};
