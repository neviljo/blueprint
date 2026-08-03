const API_BASE_URL = "";

export interface Workspace {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  canvasesCount?: number;
}

export interface Canvas {
  id: string;
  name: string;
  workspaceId: string;
  userId: string;
  content?: any;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string;
  } | null;
  session: any | null;
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
    let errorMessage = "An error occurred";
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

  async signIn(email: string, password: string): Promise<any> {
    return request("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async signUp(name: string, email: string, password: string): Promise<any> {
    return request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  async signOut(): Promise<any> {
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

  async updateContent(id: string, content: any): Promise<Canvas> {
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
};
