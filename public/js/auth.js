document.addEventListener("DOMContentLoaded", () => {
  const loginButton = document.getElementById("loginButton");
  const loginModal = document.getElementById("loginModal");
  const closeLoginModal = document.getElementById("closeLoginModal");
  const loginForm = document.getElementById("loginForm");
  const registerLink = document.getElementById("registerLink");
  const loginLinks = document.getElementsByClassName("loginLink");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const registerForm = document.getElementById("registerForm");
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");
  const navList = document.getElementById("nav-list");

  // Toggle between login, register, and forgot password forms
  function showForm(formToShow) {
    loginForm.classList.add("hidden");
    registerForm?.classList.add("hidden");
    forgotPasswordForm?.classList.add("hidden");
    formToShow.classList.remove("hidden");
  }

  // Check authentication state on page load
  function checkAuthState() {
    const accessToken = localStorage.getItem("accessToken");
    if (accessToken) {
      loginButton.textContent = "Logout";
      loginButton.addEventListener("click", handleLogout);
    } else {
      loginButton.textContent = "Login";
      loginButton.addEventListener("click", () => {
        loginModal.classList.remove("hidden");
        loginModal.classList.add("flex");
      });
    }
    const user = localStorage.getItem("user");
    if (user && JSON.parse(user)?.role === "admin") {
      const navItem = document.createElement("li");
      const navLink = document.createElement("a");

      navLink.className =
        "text-base font-semibold text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors";
      navLink.href = "/admin/configs";
      navLink.textContent = "Configs";

      navItem.appendChild(navLink);
      navList.appendChild(navItem);
    }
  }

  // Logout handler
  function handleLogout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "/";
  }

  // Login submission
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = loginForm.querySelector("#email").value;
    const password = loginForm.querySelector("#password").value;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("accessToken", data.token);
        localStorage.setItem("refreshToken", data.refreshToken);
        localStorage.setItem("user", JSON.stringify(data.user));

        // Role-based redirection
        if (data.user.role === "admin") {
          window.location.href = "/admin/configs";
        } else {
          window.location.reload();
        }
      } else {
        alert(data.message || "Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("An error occurred during login");
    }
  });

  // Registration submission
  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = registerForm.querySelector("#registerEmail").value;
    const password = registerForm.querySelector("#registerPassword").value;
    const confirmPassword =
      registerForm.querySelector("#confirmPassword").value;

    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(
          "Registration successful. Please check your email to activate your account."
        );
        showForm(loginForm);
      } else {
        alert(data.message || "Registration failed!");
      }
    } catch (error) {
      console.error("Registration error:", error);
      alert("An error occurred during registration");
    }
  });

  // Forgot password submission
  forgotPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = forgotPasswordForm.querySelector("#forgotEmail").value;

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        alert("Password reset link sent to your email");
        showForm(loginForm);
      } else {
        alert(data.message || "Password reset failed");
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      alert("An error occurred during password reset");
    }
  });

  // Navigation between forms
  registerLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showForm(registerForm);
  });

  forgotPasswordLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showForm(forgotPasswordForm);
  });

  for (const loginLink of loginLinks) {
    loginLink.addEventListener("click", (e) => {
      e.preventDefault();
      showForm(loginForm);
    });
  }

  // Initial authentication check
  checkAuthState();

  // Close modal handlers
  closeLoginModal.addEventListener("click", () => {
    loginModal.classList.add("hidden");
    loginModal.classList.remove("flex");
  });

  loginModal.addEventListener("click", (event) => {
    if (event.target === loginModal) {
      loginModal.classList.add("hidden");
    }
  });
});
