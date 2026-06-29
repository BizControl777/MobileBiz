const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  request: (method, endpoint, data) => {
    const token = localStorage.getItem("auth_token");
    return ipcRenderer.invoke("api:request", {
      method,
      endpoint,
      data,
      token,
    });
  },

  get: (endpoint) =>
    ipcRenderer.invoke("api:request", {
      method: "GET",
      endpoint,
      token: localStorage.getItem("auth_token"),
    }),

  post: (endpoint, data) =>
    ipcRenderer.invoke("api:request", {
      method: "POST",
      endpoint,
      data,
      token: localStorage.getItem("auth_token"),
    }),

  put: (endpoint, data) =>
    ipcRenderer.invoke("api:request", {
      method: "PUT",
      endpoint,
      data,
      token: localStorage.getItem("auth_token"),
    }),

  delete: (endpoint) =>
    ipcRenderer.invoke("api:request", {
      method: "DELETE",
      endpoint,
      token: localStorage.getItem("auth_token"),
    }),

  onTokenUpdated: (callback) =>
    ipcRenderer.on("auth:token-updated", (event, token) => {
      localStorage.setItem("auth_token", token);
      callback(token);
    }),

  getVersion: () => "1.0.0",
  getAppName: () => "BizController 360",
});
