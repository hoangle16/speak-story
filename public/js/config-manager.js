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
    this.setupMethodToggle();
  }

  setupMethodToggle() {
    const methodSelectors = document.getElementById("methodSelectors");
    const methodChapterNumber = document.getElementById("methodChapterNumber");
    const selectorsSection = document.getElementById("selectorsSection");
    const chapterNumberSection = document.getElementById(
      "chapterNumberSection"
    );

    const toggleSections = () => {
      if (methodSelectors.checked) {
        selectorsSection.classList.remove("hidden");
        chapterNumberSection.classList.add("hidden");
      } else {
        selectorsSection.classList.add("hidden");
        chapterNumberSection.classList.remove("hidden");
      }
    };

    methodSelectors.addEventListener("change", toggleSections);
    methodChapterNumber.addEventListener("change", toggleSections);
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
          const success = await this.handleTokenRefresh();
          if (success) {
            return this.loadConfigs();
          }
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
      config.selectors.nextChapter?.cheerio || "";
    document.getElementById("formNextPuppeteer").value =
      config.selectors.nextChapter?.puppeteer || "";
    document.getElementById("formPrevCheerio").value =
      config.selectors.prevChapter?.cheerio || "";
    document.getElementById("formPrevPuppeteer").value =
      config.selectors.prevChapter?.puppeteer || "";

    // Handle method toggle
    if (config.chapterNumber) {
      document.getElementById("methodChapterNumber").click();
      document.getElementById("formChapterRegex").value =
        config.chapterNumber.pattern.regex;
      document.getElementById("formChapterGroup").value =
        config.chapterNumber.pattern.groupIndex;
    } else {
      document.getElementById("methodSelectors").click();
    }
  }

  getFormData() {
    const useChapterNumber = document.getElementById(
      "methodChapterNumber"
    ).checked;

    const formData = {
      key: document.getElementById("formKey").value.trim(),
      domain: document.getElementById("formDomain").value.trim(),
      selectors: {
        content: document.getElementById("formContent").value.trim(),
        title: document.getElementById("formTitle").value.trim(),
      },
    };

    if (useChapterNumber) {
      formData.chapterNumber = {
        pattern: {
          regex: document.getElementById("formChapterRegex").value.trim(),
          groupIndex: parseInt(
            document.getElementById("formChapterGroup").value,
            10
          ),
        },
      };
    } else {
      formData.selectors.nextChapter = {};
      formData.selectors.prevChapter = {};

      formData.selectors.nextChapter.cheerio = document
        .getElementById("formNextCheerio")
        .value.trim();
      formData.selectors.nextChapter.puppeteer = document
        .getElementById("formNextPuppeteer")
        .value.trim();
      formData.selectors.prevChapter.cheerio = document
        .getElementById("formPrevCheerio")
        .value.trim();
      formData.selectors.prevChapter.puppeteer = document
        .getElementById("formPrevPuppeteer")
        .value.trim();
    }

    return formData;
  }

  validateForm(formData) {
    let isValid = true;
    const errors = [];
    const errorFields = new Set();

    // Reset error states
    document
      .querySelectorAll(".error-border")
      .forEach((el) => el.classList.remove("error-border"));
    document.querySelectorAll(".error-message").forEach((el) => el.remove());

    // Common validation
    if (!formData.key) {
      errors.push("Configuration key is required");
      errorFields.add("formKey");
    }
    if (!formData.domain) {
      errors.push("Domain is required");
      errorFields.add("formDomain");
    }
    if (!formData.selectors.content) {
      errors.push("Content selector is required");
      errorFields.add("formContent");
    }
    if (!formData.selectors.title) {
      errors.push("Title selector is required");
      errorFields.add("formTitle");
    }

    // Method-specific validation
    if (formData.chapterNumber) {
      if (!formData.chapterNumber.pattern.regex) {
        errors.push("Chapter regex pattern is required");
        errorFields.add("formChapterRegex");
      }
      if (isNaN(formData.chapterNumber.pattern.groupIndex)) {
        errors.push("Valid group index is required");
        errorFields.add("formChapterGroup");
      }
    } else {
      if (
        !formData.selectors.nextChapter.cheerio &&
        !formData.selectors.nextChapter.puppeteer
      ) {
        errors.push("Next chapter selector is required");
        errorFields.add("formNextCheerio");
        errorFields.add("formNextPuppeteer");
      }
      if (
        !formData.selectors.prevChapter.cheerio &&
        !formData.selectors.prevChapter.puppeteer
      ) {
        errors.push("Previous chapter selector is required");
        errorFields.add("formPrevCheerio");
        errorFields.add("formPrevPuppeteer");
      }
    }

    // Highlight error fields
    errorFields.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.classList.add("error-border");
        const errorMessage = document.createElement("p");
        errorMessage.className = "error-message";
        errorMessage.textContent = "This field is required";
        field.parentNode.appendChild(errorMessage);
      }
    });

    // Show errors
    if (errors.length > 0) {
      isValid = false;
      const errorHtml = `
          <div class="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
              <strong class="block font-medium">Please fix the following errors:</strong>
              <ul class="list-disc pl-4 mt-2">
                  ${errors.map((error) => `<li>${error}</li>`).join("")}
              </ul>
          </div>
      `;
      document.getElementById("errorContainer").innerHTML = errorHtml;
      document.getElementById("errorContainer").classList.remove("hidden");
    }

    return isValid;
  }

  async handleSubmit() {
    try {
      const formData = this.getFormData();

      if (!this.validateForm(formData)) {
        return;
      }

      const url = `/api/selectors/configs/${formData.key}`;
      const method = this.isEditing ? "PUT" : "POST";
      const body = {
        domain: formData.domain,
        selectors: formData.selectors,
      };

      if (formData.chapterNumber) {
        body.chapterNumber = formData.chapterNumber;
      }

      const response = await fetch(url, {
        method,
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (response.status === 401) {
          const success = await this.handleTokenRefresh();
          if (success) {
            return this.handleSubmit();
          }
          return;
        }
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      await this.loadConfigs();
      this.closeForm();
    } catch (error) {
      console.error("Error saving config:", error);
      alert(`Failed to save configuration: ${error.message}`);
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
            const success = await this.handleTokenRefresh();
            if (success) {
              return this.deleteConfig(key);
            }
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

  async handleTokenRefresh() {
    try {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      const response = await fetch("/api/auth/refresh-token", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}`);
      }

      const { token: accessToken, refreshToken: newRefreshToken } =
        await response.json();

      localStorage.setItem("accessToken", accessToken);
      if (newRefreshToken) {
        localStorage.setItem("refreshToken", newRefreshToken);
      }

      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      this.logout();
      return false;
    }
  }

  logout() {
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
