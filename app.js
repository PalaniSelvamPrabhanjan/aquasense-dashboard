/**
 * AquaScope Dashboard - JavaScript Application
 *
 * This application provides real-time monitoring and control for smart aquarium systems.
 * Features include sensor data visualization, tank configuration, and ML-based predictions.
 *
 * Author: Senior Frontend Engineer
 * Version: 1.0.1
 * Date: February 2026
 */

// API Configuration - AWS Lambda endpoints
const API_BASE = "https://tfswuifr58.execute-api.ap-southeast-2.amazonaws.com";

// Application state
let currentTimeline = "day";
let charts = {};              // canvasId -> Chart instance
let refreshInterval;
let retryTimeouts = {};
let isLoadingSensorData = false; // ✅ prevents overlapping chart updates (timeline + auto-refresh)

// Timeline configurations - maps to API period parameter
const TIMELINE_CONFIG = {
  day: { period: "1d", label: "1 Day" },
  week: { period: "1w", label: "1 Week" },
  month: { period: "1m", label: "1 Month" },
};

// Chart color schemes
const CHART_COLORS = {
  temperature: "#e74c3c",
  ph: "#3498db",
  ammonia: "#f39c12",
  waterLevel: "#2ecc71",
};

/**
 * Application initialization
 */
document.addEventListener("DOMContentLoaded", function () {
  console.log("🌊 AquaScope Dashboard initializing...");
  initializeApplication();
});

/**
 * Main application initialization function
 */
async function initializeApplication() {
  try {
    await Promise.all([loadTankProfile(), loadSensorData()]);
    updatePredictionPanel();
    startAutoRefresh();
    console.log("✅ AquaScope Dashboard initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize dashboard:", error);
    showErrorMessage("Failed to load dashboard data. Retrying...");
    setTimeout(initializeApplication, 5000);
  }
}

/**
 * Load tank profile information from API
 */
async function loadTankProfile() {
  try {
    const response = await fetch(`${API_BASE}/tank-profile?tank_id=tank_001`);

    if (!response.ok) {
      throw new Error(`Tank profile API error: ${response.status}`);
    }

    const profile = await response.json();
    updateTankDisplay(profile);

    console.log("📊 Tank profile loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load tank profile:", error);

    // Show placeholder data
    updateTankDisplay({
      volume: "N/A",
      target_water_level: "N/A",
      fish_count: {
        small: "N/A",
        medium: "N/A",
        large: "N/A",
        extra_large: "N/A",
      },
    });

    // Retry after 60 seconds
    retryTimeouts.tankProfile = setTimeout(loadTankProfile, 60000);
  }
}

/**
 * Update tank information display
 */
function updateTankDisplay(profile) {
  const volume = profile.tank_volume_liters ?? profile.volume ?? "N/A";
  const targetWaterLevel = profile.target_water_level ?? "N/A";

  document.getElementById("tankVolume").textContent = volume;
  document.getElementById("targetWaterLevel").textContent = targetWaterLevel;

  const fishSmall = profile.fish_small ?? profile.fish_count?.small ?? "0";
  const fishMedium = profile.fish_medium ?? profile.fish_count?.medium ?? "0";
  const fishLarge = profile.fish_large ?? profile.fish_count?.large ?? "0";
  const fishXLarge = profile.fish_xlarge ?? profile.fish_count?.extra_large ?? "0";

  document.getElementById("fishSmall").textContent = fishSmall;
  document.getElementById("fishMedium").textContent = fishMedium;
  document.getElementById("fishLarge").textContent = fishLarge;
  document.getElementById("fishExtraLarge").textContent = fishXLarge;

  window.currentProfile = profile;
}

/**
 * Load sensor data based on current timeline selection
 */
async function loadSensorData() {
  // ✅ Prevent overlapping runs (timeline change + auto-refresh)
  if (isLoadingSensorData) return;
  isLoadingSensorData = true;

  const config = TIMELINE_CONFIG[currentTimeline];

  try {
    showLoading(true);

    const url = `${API_BASE}/readings?device_id=aquasense_01&period=${config.period}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Sensor data API error: ${response.status}`);
    }

    const responseData = await response.json();

    // Expected shape: { items: [...], start: "...", end: "...", count: N }
    if (responseData && Array.isArray(responseData.items)) {
      const readings = responseData.items;

      if (readings.length > 0) {
        updateCharts(readings);
        hideChartPlaceholders();
        console.log(
          `📈 Loaded ${readings.length} sensor readings for ${config.label} (${responseData.start ?? "?"} to ${responseData.end ?? "?"})`
        );
      } else {
        // ✅ Don’t throw a hard error (keeps app stable)
        showChartPlaceholders();
        console.warn(`⚠️ No sensor data for ${config.label}.`);
      }
    } else {
      throw new Error("Invalid API response format");
    }
  } catch (error) {
    console.error("❌ Failed to load sensor data:", error);
    showChartPlaceholders();

    if (retryTimeouts.sensorData) {
      clearTimeout(retryTimeouts.sensorData);
    }
    retryTimeouts.sensorData = setTimeout(loadSensorData, 60000);
  } finally {
    showLoading(false);
    isLoadingSensorData = false;
  }
}

/**
 * Update all charts with new sensor data
 */
function updateCharts(readings) {
  const chartData = processChartData(readings);

  updateChart("temperatureChart", "Temperature (°C)", chartData.temperature, CHART_COLORS.temperature);
  updateChart("phChart", "pH Level", chartData.ph, CHART_COLORS.ph);
  updateChart("ammoniaChart", "Ammonia (ppm)", chartData.ammonia, CHART_COLORS.ammonia);
  updateChart("waterLevelChart", "Water Level (%)", chartData.waterLevel, CHART_COLORS.waterLevel);
}

/**
 * Process raw sensor readings into chart-ready format
 */
function processChartData(readings) {
  readings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return {
    temperature: readings.map((r) => ({ x: new Date(r.timestamp), y: parseFloat(r.temperature) || 0 })),
    ph: readings.map((r) => ({ x: new Date(r.timestamp), y: parseFloat(r.ph) || 0 })),
    ammonia: readings.map((r) => ({ x: new Date(r.timestamp), y: parseFloat(r.ammonia) || 0 })),
    waterLevel: readings.map((r) => ({ x: new Date(r.timestamp), y: parseFloat(r.water_level) || 0 })),
  };
}

/**
 * Update or create a Chart.js chart
 * Fixes "Canvas is already in use" by destroying any existing chart tied to that canvas.
 *
 * NOTE: Requires a date adapter for time scale (you already added date-fns adapter in index.html).
 */
function updateChart(canvasId, label, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // ✅ Destroy chart we track (if any)
  if (charts[canvasId]) {
    charts[canvasId].destroy();
    delete charts[canvasId];
  }

  // ✅ Extra safety: destroy chart Chart.js is tracking for this canvas
  // (prevents desync issues after exceptions)
  const existing = Chart.getChart(canvas);
  if (existing) {
    existing.destroy();
  }

  charts[canvasId] = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label,
          data,
          borderColor: color,
          backgroundColor: color + "20",
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 1,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          type: "time",
          time: {
            tooltipFormat: "MMM dd, HH:mm",
            displayFormats: {
              hour: "HH:mm",
              day: "MMM dd",
              week: "MMM dd",
              month: "MMM dd",
            },
          },
          grid: { color: "#e9ecef" },
        },
        y: {
          beginAtZero: false,
          grid: { color: "#e9ecef" },
        },
      },
      interaction: { intersect: false, mode: "index" },
      animation: { duration: 500 },
    },
  });
}

/**
 * Show/hide chart placeholders
 */
function showChartPlaceholders() {
  const placeholders = ["temperaturePlaceholder", "phPlaceholder", "ammoniaPlaceholder", "waterLevelPlaceholder"];
  placeholders.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("show");
  });
}

function hideChartPlaceholders() {
  const placeholders = ["temperaturePlaceholder", "phPlaceholder", "ammoniaPlaceholder", "waterLevelPlaceholder"];
  placeholders.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("show");
  });
}

/**
 * Timeline selector event handler
 */
function selectTimeline(period) {
  currentTimeline = period;

  const dropdown = document.getElementById("timelineSelect");
  if (dropdown && dropdown.value !== period) {
    dropdown.value = period;
  }

  // Reload sensor data for new timeline
  loadSensorData();

  console.log(`📅 Timeline changed to: ${TIMELINE_CONFIG[period].label}`);
}

/**
 * Settings modal functions
 */
function openSettingsModal() {
  const profile = window.currentProfile || {};

  const volume = profile.tank_volume_liters ?? profile.volume ?? "";
  const targetLevel = profile.target_water_level ?? "";
  const fishSmall = profile.fish_small ?? profile.fish_count?.small ?? 0;
  const fishMedium = profile.fish_medium ?? profile.fish_count?.medium ?? 0;
  const fishLarge = profile.fish_large ?? profile.fish_count?.large ?? 0;
  const fishXLarge = profile.fish_xlarge ?? profile.fish_count?.extra_large ?? 0;

  document.getElementById("volumeInput").value = volume;
  document.getElementById("targetLevelInput").value = targetLevel;
  document.getElementById("fishSmallInput").value = fishSmall;
  document.getElementById("fishMediumInput").value = fishMedium;
  document.getElementById("fishLargeInput").value = fishLarge;
  document.getElementById("fishExtraLargeInput").value = fishXLarge;

  const message = document.getElementById("settingsMessage");
  message.className = "message";
  message.textContent = "";

  document.getElementById("settingsModal").classList.add("show");
}

function closeSettingsModal() {
  document.getElementById("settingsModal").classList.remove("show");
}

/**
 * Save tank settings via API
 */
async function saveSettings(event) {
  event.preventDefault();

  const settings = {
    tank_id: "tank_001",
    tank_volume_liters: parseInt(document.getElementById("volumeInput").value, 10),
    target_water_level: parseInt(document.getElementById("targetLevelInput").value, 10),
    fish_small: parseInt(document.getElementById("fishSmallInput").value, 10),
    fish_medium: parseInt(document.getElementById("fishMediumInput").value, 10),
    fish_large: parseInt(document.getElementById("fishLargeInput").value, 10),
    fish_xlarge: parseInt(document.getElementById("fishExtraLargeInput").value, 10),
    updated_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(`${API_BASE}/tank-profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      throw new Error(`Settings API error: ${response.status}`);
    }

    updateTankDisplay({
      tank_volume_liters: settings.tank_volume_liters,
      target_water_level: settings.target_water_level,
      fish_small: settings.fish_small,
      fish_medium: settings.fish_medium,
      fish_large: settings.fish_large,
      fish_xlarge: settings.fish_xlarge,
    });

    showSettingsMessage("Settings saved successfully!", "success");
    setTimeout(closeSettingsModal, 2000);

    console.log("✅ Tank settings saved successfully");
  } catch (error) {
    console.error("❌ Failed to save settings:", error);
    showSettingsMessage("Failed to save settings. Please try again.", "error");
  }
}

function showSettingsMessage(text, type) {
  const message = document.getElementById("settingsMessage");
  message.textContent = text;
  message.className = `message ${type}`;
}

/**
 * Prediction panel (placeholder)
 */
function updatePredictionPanel() {
  const predictedValue = getPredictedAmmonia();

  document.getElementById("predictedAmmonia").textContent = predictedValue.toFixed(2);

  const statusElement = document.getElementById("predictionStatus");
  const indicator = statusElement.querySelector(".status-indicator");
  const text = statusElement.querySelector(".status-text");

  if (predictedValue <= 0.25) {
    indicator.className = "status-indicator safe";
    text.textContent = "Safe";
  } else if (predictedValue <= 0.5) {
    indicator.className = "status-indicator caution";
    text.textContent = "Caution";
  } else {
    indicator.className = "status-indicator danger";
    text.textContent = "Dangerous";
  }
}

function getPredictedAmmonia() {
  return 0.48;
}

/**
 * Auto-refresh functionality
 */
function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(async () => {
    console.log("🔄 Auto-refreshing dashboard data...");

    try {
      await Promise.all([loadTankProfile(), loadSensorData()]);
      updatePredictionPanel();
    } catch (error) {
      console.error("❌ Auto-refresh failed:", error);
    }
  }, 60000);

  console.log("⏰ Auto-refresh started (60-second interval)");
}

/**
 * Loading indicator
 */
function showLoading(show) {
  const indicator = document.getElementById("loadingIndicator");
  if (!indicator) return;

  if (show) indicator.classList.add("show");
  else indicator.classList.remove("show");
}

/**
 * Error message display
 */
function showErrorMessage(message) {
  console.error("🚨 Error:", message);
}

/**
 * Cleanup on unload
 */
window.addEventListener("beforeunload", function () {
  if (refreshInterval) clearInterval(refreshInterval);

  Object.values(retryTimeouts).forEach((t) => clearTimeout(t));

  Object.values(charts).forEach((chart) => {
    if (chart) chart.destroy();
  });

  charts = {};
  console.log("🧹 Dashboard cleanup completed");
});

/**
 * Modal UX
 */
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeSettingsModal();
});

// Click outside modal to close
document.getElementById("settingsModal").addEventListener("click", function (event) {
  if (event.target === this) closeSettingsModal();
});

/**
 * Responsive chart handling
 */
window.addEventListener("resize", function () {
  clearTimeout(window.resizeTimeout);
  window.resizeTimeout = setTimeout(() => {
    Object.values(charts).forEach((chart) => {
      if (chart) chart.resize();
    });
  }, 250);
});

// Export functions for global access
window.AquaScope = {
  selectTimeline,
  openSettingsModal,
  closeSettingsModal,
  saveSettings,
  getPredictedAmmonia,
};

console.log("AquaScope Dashboard JavaScript loaded successfully");
