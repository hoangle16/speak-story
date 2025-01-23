import { ThemeManager } from "./theme-manager.js";

class ConfigManager {
  constructor() {
    this.configs = {};
    this.isEditing = false;
    this.currentKey = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadConfigs();
  }

  getAuthHeaders() {
    const accessToken = localStorage.getItem("accessToken");
    return {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    };
  }

  bindEvents() {
    // Add config button
    document.getElementById("addConfigBtn").addEventListener("click", () => {
      this.showForm();
    });

    // Cancel button
    document.getElementById("cancelBtn").addEventListener("click", () => {
      this.closeForm();
    });

    // Form submit
    document.getElementById("configForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  }

  async loadConfigs() {
    try {
      const response = await fetch("/api/selectors/configs", {
        method: "GET",
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) {
        if (response.status === 401) {
          this.handleTokenRefresh();
          return;
        }
        throw new Error("Failed to load configs");
      }
      this.configs = await response.json();
      this.renderTable();
    } catch (error) {
      console.error("Error loading configs:", error);
      alert("Failed to load configurations");
    }
  }

  renderTable() {
    const tbody = document.getElementById("configTableBody");
    tbody.innerHTML = "";

    Object.entries(this.configs).forEach(([key, config]) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-gray-50 dark:hover:bg-gray-700";
      row.innerHTML = `
                  <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white">${key}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white">${config.domain}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                      <button class="text-blue-600 hover:text-blue-800 mr-3 edit-btn">Edit</button>
                      <button class="text-red-600 hover:text-red-800 delete-btn">Delete</button>
                  </td>
              `;

      // Add event listeners for edit and delete buttons
      row
        .querySelector(".edit-btn")
        .addEventListener("click", () => this.editConfig(key));
      row
        .querySelector(".delete-btn")
        .addEventListener("click", () => this.deleteConfig(key));

      tbody.appendChild(row);
    });
  }

  showForm() {
    document.getElementById("formModal").classList.remove("hidden");
    document.getElementById("formModal").classList.add("flex");
    document.getElementById("modalTitle").textContent = this.isEditing
      ? "Edit Configuration"
      : "Add New Configuration";
    document.getElementById("formKey").disabled = this.isEditing;
  }

  closeForm() {
    document.getElementById("formModal").classList.add("hidden");
    document.getElementById("formModal").classList.remove("flex");
    document.getElementById("configForm").reset();
    this.isEditing = false;
    this.currentKey = null;
  }

  fillForm(config) {
    document.getElementById("formKey").value = this.currentKey;
    document.getElementById("formDomain").value = config.domain;
    document.getElementById("formContent").value = config.selectors.content;
    document.getElementById("formTitle").value = config.selectors.title;
    document.getElementById("formNextCheerio").value =
      config.selectors.nextChapter.cheerio;
    document.getElementById("formNextPuppeteer").value =
      config.selectors.nextChapter.puppeteer;
    document.getElementById("formPrevCheerio").value =
      config.selectors.prevChapter.cheerio;
    document.getElementById("formPrevPuppeteer").value =
      config.selectors.prevChapter.puppeteer;
  }

  getFormData() {
    return {
      key: document.getElementById("formKey").value,
      domain: document.getElementById("formDomain").value,
      selectors: {
        content: document.getElementById("formContent").value,
        title: document.getElementById("formTitle").value,
        nextChapter: {
          cheerio: document.getElementById("formNextCheerio").value,
          puppeteer: document.getElementById("formNextPuppeteer").value,
        },
        prevChapter: {
          cheerio: document.getElementById("formPrevCheerio").value,
          puppeteer: document.getElementById("formPrevPuppeteer").value,
        },
      },
    };
  }

  async handleSubmit() {
    try {
      const formData = this.getFormData();
      const url = `/api/selectors/configs/${formData.key}`;
      const method = this.isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          domain: formData.domain,
          selectors: formData.selectors,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.handleTokenRefresh();
          return;
        }
        throw new Error("Failed to save config");
      }

      await this.loadConfigs();
      this.closeForm();
    } catch (error) {
      console.error("Error saving config:", error);
      alert("Failed to save configuration");
    }
  }

  editConfig(key) {
    this.isEditing = true;
    this.currentKey = key;
    this.fillForm(this.configs[key]);
    this.showForm();
  }

  async deleteConfig(key) {
    if (confirm("Are you sure you want to delete this configuration?")) {
      try {
        const response = await fetch(`/api/selectors/configs/${key}`, {
          method: "DELETE",
          headers: this.getAuthHeaders(),
        });

        if (!response.ok) {
          if (response.status === 401) {
            this.handleTokenRefresh();
            return;
          }
          throw new Error("Failed to delete config");
        }

        await this.loadConfigs();
      } catch (error) {
        console.error("Error deleting config:", error);
        alert("Failed to delete configuration");
      }
    }
  }

  handleTokenRefresh() {
    // TODO: Implement token refresh logic
    // 1. Using the refresh token to get a new access token
    // 2. Updating localStorage with new tokens
    // 3. Retrying the original request
    // If refresh fails, log out the user
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "/";
  }
}

// Initialize the configuration manager when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const loginButton = document.getElementById("loginButton");

  const checkAuthState = () => {
    const accessToken = localStorage.getItem("accessToken");
    const user = localStorage.getItem("user");

    if (!accessToken || !user || JSON.parse(user)?.role !== "admin") {
      window.location.href = "/";
    }
    loginButton.textContent = "Logout";
    loginButton.addEventListener("click", () => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      window.location.href = "/";
    });
  };

  checkAuthState();

  const themeManager = new ThemeManager();
  themeManager.init();
  new ConfigManager();
});
