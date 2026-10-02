// Production adapter contract for a company-hosted Lokalblick frontend.
// Not loaded by the public GitHub Pages demo.
(function () {
  function jsonHeaders() {
    return { "Content-Type": "application/json" };
  }

  async function request(url, options) {
    const response = await fetch(url, Object.assign({ credentials: "same-origin" }, options || {}));
    if (!response.ok) {
      throw new Error("Lokalblick API " + response.status + " " + response.statusText);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  window.createLokalblickApiDataService = function createLokalblickApiDataService(baseUrl) {
    const api = String(baseUrl || "/api").replace(/\/$/, "");
    return {
      mode: "m365-api",
      async load() {
        return request(api + "/bootstrap");
      },
      async save(data) {
        return request(api + "/workspace", {
          method: "PATCH",
          headers: jsonHeaders(),
          body: JSON.stringify(data)
        });
      },
      async reset() {
        return this.load();
      }
    };
  };
})();
