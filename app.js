/**
 * AquaScope Dashboard - JavaScript Application
 *
 * This application provides real-time monitoring and control for smart aquarium systems.
 * Features include sensor data visualization, tank configuration, and ML-based predictions.
 *
 * Author: Senior Frontend Engineer
 * Version: 1.0.2
 * Date: February 2026
 */

// API Configuration - AWS Lambda endpoints
const API_BASE = "https://tfswuifr58.execute-api.ap-southeast-2.amazonaws.com";

// Application state
let currentTimeline = "day";
let charts = {};              // canvasId -> Chart instance
let refreshInterval;
let retryTimeouts = {};
let isLoadingSensorData = false;
let currentPage = "overview"; // Track which page is loaded

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

// Alert thresholds and ranges
const ALERT_THRESHOLDS = {
  temperature: { min: 24, max: 30, label: "Temperature" },
  ph: { min: 6.5, max: 8.0, label: "pH Level" },
  ammonia: { max: 0.25, label: "Ammonia" },
  waterLevel: { percentageOfTarget: 0.8, label: "Water Level" },
};

// Ammonia prediction API endpoint
const AMMONIA_PREDICTION_API = "https://lhzz7dph64.execute-api.ap-southeast-2.amazonaws.com/predict";

// Ammonia status thresholds (mg/L)
const AMMONIA_STATUS_THRESHOLDS = {
  healthy: 0.25,
  warning: 0.5,
};

/**
 * Detect current page based on loaded sections
 */
function detectCurrentPage() {
  if (document.getElementById("temperatureChart")) {
    currentPage = "monitoring";
  } else if (document.getElementById("feedingHistorySection")) {
    currentPage = "feeding";
  } else {
    currentPage = "overview";
  }
  console.log(`📄 Detected page: ${currentPage}`);
}

/**
 * Application initialization
 */
document.addEventListener("DOMContentLoaded", function () {
  console.log("🌊 AquaScope Dashboard initializing...");
  detectCurrentPage();
  
  // Set active nav link
  const currentFile = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentFile || (currentFile === '' && href === 'index.html')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
  
  initializeApplication();
  setupFeederForm();
  
  // Bind predict ammonia button event listener
  const predictAmmoniaBtn = document.getElementById("predictAmmoniaBtn");
  if (predictAmmoniaBtn) {
    predictAmmoniaBtn.addEventListener("click", onPredictAmmoniaClick);
  }
  
  // Bind Settings button event listeners (remove inline onclick handlers)
  document.querySelectorAll(".btn-settings").forEach(btn => {
    btn.addEventListener("click", openSettingsModal);
  });
  
  // Bind edit pending form submission
  const editPendingForm = document.getElementById("editPendingForm");
  if (editPendingForm) {
    editPendingForm.addEventListener("submit", handleEditPendingSubmit);
  }
  
  // Close modals on escape key
  document.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
      closeEditPendingModal();
      closeDeletePendingModal();
    }
  });
  
  // Close modals on outside click
  const editModal = document.getElementById("editPendingModal");
  if (editModal) {
    editModal.addEventListener("click", function(event) {
      if (event.target === this) closeEditPendingModal();
    });
  }
  
  const deleteModal = document.getElementById("deletePendingModal");
  if (deleteModal) {
    deleteModal.addEventListener("click", function(event) {
      if (event.target === this) closeDeletePendingModal();
    });
  }
  
});

/**
 * Main application initialization function
 */
async function initializeApplication() {
  try {
    // Load tank profile on overview, monitoring, and feeding pages (needed for ammonia prediction)
    if (currentPage === "overview" || currentPage === "monitoring" || currentPage === "feeding") {
      await loadTankProfile();
    }

    // Load sensor data on both overview (for alerts) and monitoring (for charts) pages
    if (currentPage === "overview" || currentPage === "monitoring") {
      await loadSensorData();
    }

    // Load feeding events on feeding page
    if (currentPage === "feeding") {
      await loadPendingFeedings();
      await loadFeedingEvents();
    }

    // Update prediction panel on feeding and overview pages
    if (currentPage === "feeding" || currentPage === "overview") {
      updatePredictionPanel();
    }

    // Only start auto-refresh on monitoring page
    if (currentPage === "monitoring") {
      startAutoRefresh();
    }

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
      appropriate_water_level: "N/A",
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
  const appropriateLevelCm = profile.appropriate_water_level ?? profile.target_water_level ?? "N/A";

  const volumeEl = document.getElementById("tankVolume");
  const levelEl = document.getElementById("appropriateWaterLevel");
  
  if (volumeEl) volumeEl.textContent = volume;
  if (levelEl) levelEl.textContent = appropriateLevelCm;

  const fishSmall = profile.fish_small ?? profile.fish_count?.small ?? "0";
  const fishMedium = profile.fish_medium ?? profile.fish_count?.medium ?? "0";
  const fishLarge = profile.fish_large ?? profile.fish_count?.large ?? "0";
  const fishXLarge = profile.fish_xlarge ?? profile.fish_count?.extra_large ?? "0";

  const smallEl = document.getElementById("fishSmall");
  const mediumEl = document.getElementById("fishMedium");
  const largeEl = document.getElementById("fishLarge");
  const xlargeEl = document.getElementById("fishExtraLarge");
  
  if (smallEl) smallEl.textContent = fishSmall;
  if (mediumEl) mediumEl.textContent = fishMedium;
  if (largeEl) largeEl.textContent = fishLarge;
  if (xlargeEl) xlargeEl.textContent = fishXLarge;

  window.currentProfile = profile;
}

/**
 * Load sensor data based on current timeline selection
 */
async function loadSensorData() {
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
        updateAlerts(readings);
        console.log(
          `📈 Loaded ${readings.length} sensor readings for ${config.label} (${responseData.start ?? "?"} to ${responseData.end ?? "?"})`
        );
      } else {
        // ✅ Don't throw a hard error (keeps app stable)
        showChartPlaceholders();
        updateAlerts([]);
        console.warn(`⚠️ No sensor data for ${config.label}.`);
      }
    } else {
      throw new Error("Invalid API response format");
    }
  } catch (error) {
    console.error("❌ Failed to load sensor data:", error);
    showChartPlaceholders();
    updateAlerts([]);

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
 * Get time axis configuration based on current timeline
 */
function getTimeAxisOptions() {
  const baseConfig = {
    type: "time",
    bounds: "data",
    ticks: {
      autoSkip: true,
      autoSkipPadding: 40,
      maxTicksLimit: 5,
      maxRotation: 0,
      minRotation: 0,
    },
    grid: { color: "#e9ecef" },
  };

  // Configure display format and unit based on timeline
  switch (currentTimeline) {
    case "day":
      baseConfig.time = {
        unit: "hour",
        tooltipFormat: "MMM dd, yyyy HH:mm",
        displayFormats: {
          hour: "HH:mm",
        },
      };
      break;
    case "week":
      baseConfig.time = {
        unit: "day",
        tooltipFormat: "MMM dd, yyyy HH:mm",
        displayFormats: {
          day: "MMM dd",
        },
      };
      break;
    case "month":
      baseConfig.time = {
        unit: "week",
        tooltipFormat: "MMM dd, yyyy",
        displayFormats: {
          week: "MMM dd",
        },
      };
      break;
    default:
      baseConfig.time = {
        tooltipFormat: "MMM dd, yyyy HH:mm",
        displayFormats: {
          hour: "HH:mm",
          day: "MMM dd",
        },
      };
  }

  return baseConfig;
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
        x: getTimeAxisOptions(),
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
  const appropriateLevel = profile.appropriate_water_level ?? profile.target_water_level ?? "";
  const fishSmall = profile.fish_small ?? profile.fish_count?.small ?? 0;
  const fishMedium = profile.fish_medium ?? profile.fish_count?.medium ?? 0;
  const fishLarge = profile.fish_large ?? profile.fish_count?.large ?? 0;
  const fishXLarge = profile.fish_xlarge ?? profile.fish_count?.extra_large ?? 0;

  const volumeInput = document.getElementById("volumeInput");
  const levelInput = document.getElementById("targetLevelInput");
  const fishSmallInput = document.getElementById("fishSmallInput");
  const fishMediumInput = document.getElementById("fishMediumInput");
  const fishLargeInput = document.getElementById("fishLargeInput");
  const fishExtraLargeInput = document.getElementById("fishExtraLargeInput");
  const message = document.getElementById("settingsMessage");
  const modal = document.getElementById("settingsModal");

  if (!modal || !volumeInput || !levelInput) return;

  volumeInput.value = volume;
  levelInput.value = appropriateLevel;
  if (fishSmallInput) fishSmallInput.value = fishSmall;
  if (fishMediumInput) fishMediumInput.value = fishMedium;
  if (fishLargeInput) fishLargeInput.value = fishLarge;
  if (fishExtraLargeInput) fishExtraLargeInput.value = fishXLarge;

  if (message) {
    message.className = "message";
    message.textContent = "";
  }

  modal.classList.add("show");
}

function closeSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.classList.remove("show");
}

/**
 * Update alerts based on latest readings
 */
function updateAlerts(readings) {
  const alertsList = document.getElementById("alertsList");
  if (!alertsList) return;

  const alerts = [];
  const profile = window.currentProfile || {};
  const appropriateLevel = profile.appropriate_water_level ?? profile.target_water_level;

  if (readings.length === 0) {
    alertsList.innerHTML = `
      <div class="alert alert-info">
        <i class="fas fa-info-circle"></i>
        <span>No data available to check alerts</span>
      </div>
    `;
    return;
  }

  // Get latest reading (sorted by timestamp)
  const latest = readings.reduce((recent, current) => {
    return new Date(current.timestamp) > new Date(recent.timestamp) ? current : recent;
  });

  const temp = parseFloat(latest.temperature);
  const ph = parseFloat(latest.ph);
  const ammonia = parseFloat(latest.ammonia);
  const waterLevel = parseFloat(latest.water_level);

  // Temperature check
  if (!isNaN(temp)) {
    if (temp < ALERT_THRESHOLDS.temperature.min) {
      alerts.push({
        level: "danger",
        title: "Low Temperature",
        value: `${temp.toFixed(1)}°C (min: ${ALERT_THRESHOLDS.temperature.min}°C)`,
        suggestion: "Check thermal regulator and heating system",
      });
    } else if (temp > ALERT_THRESHOLDS.temperature.max) {
      alerts.push({
        level: "danger",
        title: "High Temperature",
        value: `${temp.toFixed(1)}°C (max: ${ALERT_THRESHOLDS.temperature.max}°C)`,
        suggestion: "Check cooling system and water circulation",
      });
    }
  }

  // pH check
  if (!isNaN(ph)) {
    if (ph < ALERT_THRESHOLDS.ph.min) {
      alerts.push({
        level: "caution",
        title: "Low pH",
        value: `${ph.toFixed(2)} (min: ${ALERT_THRESHOLDS.ph.min})`,
        suggestion: "Perform water change and check water source",
      });
    } else if (ph > ALERT_THRESHOLDS.ph.max) {
      alerts.push({
        level: "caution",
        title: "High pH",
        value: `${ph.toFixed(2)} (max: ${ALERT_THRESHOLDS.ph.max})`,
        suggestion: "Perform water change and review filtration",
      });
    }
  }

  // Ammonia check
  if (!isNaN(ammonia)) {
    if (ammonia > ALERT_THRESHOLDS.ammonia.max) {
      alerts.push({
        level: "danger",
        title: "High Ammonia Detected",
        value: `${ammonia.toFixed(3)} ppm (max: ${ALERT_THRESHOLDS.ammonia.max} ppm)`,
        suggestion: "Perform immediate water change and check biofilter",
      });
    }
  }

  // Water level check (handle both % and cm)
  if (!isNaN(waterLevel) && appropriateLevel) {
    const appropriateLevelNum = parseFloat(appropriateLevel);
    let isLow = false;
    let displayValue = "";

    // Assumption logic:
    // - If waterLevel is <= 1.5 * appropriateLevel and appropriateLevel is large (e.g., 100),
    //   assume waterLevel is in cm and compare against 80% of appropriate level.
    // - Otherwise, if waterLevel is between 0–100, treat it as percent and compare against 80%.
    if (appropriateLevelNum >= 50 && waterLevel <= appropriateLevelNum * 1.5) {
      const minLevelCm = appropriateLevelNum * ALERT_THRESHOLDS.waterLevel.percentageOfTarget;
      isLow = waterLevel < minLevelCm;
      displayValue = `${waterLevel.toFixed(1)} cm (min: ${minLevelCm.toFixed(1)} cm)`;
    } else if (waterLevel >= 0 && waterLevel <= 100) {
      isLow = waterLevel < 80;
      displayValue = `${waterLevel.toFixed(1)}% (min: 80%)`;
    }

    if (isLow) {
      alerts.push({
        level: "caution",
        title: "Low Water Level",
        value: displayValue || `${waterLevel.toFixed(1)} (minimum: 80% of target)`,
        suggestion: "Top up water to appropriate level",
      });
    }
  }

  // Render alerts or "all safe" message
  if (alerts.length === 0) {
    alertsList.innerHTML = `
      <div class="alert alert-success">
        <i class="fas fa-check-circle"></i>
        <span>All parameters within safe ranges</span>
      </div>
    `;
  } else {
    alertsList.innerHTML = alerts
      .map(
        (alert) => `
      <div class="alert alert-${alert.level}">
        <div class="alert-header">
          <i class="fas fa-${alert.level === "danger" ? "exclamation-circle" : "info-circle"}"></i>
          <strong>${alert.title}</strong>
        </div>
        <div class="alert-content">
          <p class="alert-value">${alert.value}</p>
          <p class="alert-suggestion"><i class="fas fa-lightbulb"></i> ${alert.suggestion}</p>
        </div>
      </div>
    `
      )
      .join("");
  }

  console.log(`🚨 Alerts updated: ${alerts.length} alert(s) detected`);
}

/**
 * Auto Feeder functionality
 */
async function createFeedingEvent(payload) {
  try {
    const response = await fetch(`${API_BASE}/feeding-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Try to read error message from response
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          console.error("Backend error response:", errorBody);
          errorMessage = errorBody;
        }
      } catch (e) {
        // Unable to parse response body
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log("✅ Feeding event created successfully:", result);
    return result;
  } catch (error) {
    console.error("❌ Failed to create feeding event:", error);
    throw error;
  }
}

/**
 * Auto Feeder functionality
 */
function setupFeederForm() {
  const form = document.getElementById("feederForm");
  if (!form) return;

  // Load saved values from localStorage
  const savedTime = localStorage.getItem("feederTime");
  const savedQty = localStorage.getItem("feederQty");

  if (savedTime) document.getElementById("feederTime").value = savedTime;
  if (savedQty) document.getElementById("feederQty").value = savedQty;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const datetimeValue = document.getElementById("feederTime").value;
    const qty = parseFloat(document.getElementById("feederQty").value);
    const submitBtn = form.querySelector('button[type="submit"]');

    // Validate inputs
    if (!datetimeValue || isNaN(qty) || qty < 0 || qty > 10) {
      showFeederMessage("Please enter valid date/time and quantity (0-10g)", "error");
      return;
    }

    // Disable button during submission
    submitBtn.disabled = true;
    submitBtn.textContent = "Scheduling...";

    try {
      // Extract ISO timestamp directly from datetime-local input
      // datetime-local format: YYYY-MM-DDTHH:mm
      const feedTime = datetimeValue + ":00"; // Add seconds - scheduled feed time
      const timestamp = new Date().toISOString(); // Current time when posting

      // Create feeding event via API
      // Backend expects: tank_id, feed_quantity_g, feedtime, timestamp, status
      const payload = {
        tank_id: "tank_001",
        feed_quantity_g: qty,
        feedtime: feedTime,
        timestamp: timestamp,
        status: "pending",
      };

      console.log("📤 Sending feeder payload:", payload);
      await createFeedingEvent(payload);

      // Save to localStorage as well
      localStorage.setItem("feederTime", datetimeValue);
      localStorage.setItem("feederQty", qty);

      showFeederMessage(`✅ Feed scheduled for ${new Date(feedTime).toLocaleString()} - ${qty}g`, "success");
      console.log(`📅 Feeder scheduled: ${feedTime} / ${qty}g`);
      
      // Reload both pending and history if available
      if (currentPage === "feeding") {
        await loadPendingFeedings();
        await loadFeedingEvents();
      }
    } catch (error) {
      console.error("❌ Feeder submission failed:", error);
      showFeederMessage(`❌ Failed to schedule feed: ${error.message}`, "error");
    } finally {
      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.textContent = "Schedule Feed";
    }
  });
}

function showFeederMessage(text, type) {
  const messageEl = document.getElementById("feederMessage");
  if (messageEl) {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = "block";

    if (type === "success") {
      setTimeout(() => {
        messageEl.style.display = "none";
      }, 3000);
    }
  }
}

/**
 * Ammonia Prediction Functions
 */

/**
 * Fetch ammonia prediction from API
 * @param {Object} payload - Prediction payload
 * @returns {Promise<number>} Predicted ammonia value
 */
async function predictAmmonia(payload) {
  try {
    const response = await fetch(AMMONIA_PREDICTION_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return parseFloat(data.prediction_ammonia) || 0;
  } catch (error) {
    console.error("❌ Ammonia prediction API failed:", error);
    throw error;
  }
}

/**
 * Get ammonia status and CSS class based on predicted value
 * @param {number} prediction - Predicted ammonia level (mg/L)
 * @returns {Object} { status, className }
 */
function getAmmoniaStatus(prediction) {
  if (prediction < AMMONIA_STATUS_THRESHOLDS.healthy) {
    return {
      status: "Healthy range",
      className: "healthy",
    };
  } else if (prediction < AMMONIA_STATUS_THRESHOLDS.warning) {
    return {
      status: "Elevated — monitor closely",
      className: "warning",
    };
  } else {
    return {
      status: "Very high — toxic risk to fish",
      className: "danger",
    };
  }
}

/**
 * Click handler for "Predict End-of-Day Ammonia" button
 */
async function onPredictAmmoniaClick() {
  const btn = document.getElementById("predictAmmoniaBtn");
  const profile = window.currentProfile || {};
  const feederQtyInput = document.getElementById("feederQty");

  // Validate prerequisites
  if (!profile.tank_volume_liters && !profile.volume) {
    alert("❌ Tank profile not loaded. Please refresh the page.");
    return;
  }

  if (!feederQtyInput || !feederQtyInput.value) {
    alert("⚠️ Please enter a feeding quantity first to make a prediction.");
    return;
  }

  // Disable button and show loading state
  btn.disabled = true;
  btn.textContent = "Predicting…";
  btn.classList.add("loading");

  try {
    // Build payload from existing form data and tank profile
    const tankVolume = profile.tank_volume_liters ?? profile.volume ?? 0;
    const feedQty = parseFloat(feederQtyInput.value);

    const payload = {
      tank_volume_liters: parseInt(tankVolume, 10),
      fish_small: parseInt(profile.fish_small ?? profile.fish_count?.small ?? 0, 10),
      fish_medium: parseInt(profile.fish_medium ?? profile.fish_count?.medium ?? 0, 10),
      fish_large: parseInt(profile.fish_large ?? profile.fish_count?.large ?? 0, 10),
      fish_xlarge: parseInt(profile.fish_xlarge ?? profile.fish_count?.extra_large ?? 0, 10),
      feed_quantity_g: feedQty,
    };

    console.log("📤 Sending ammonia prediction payload:", payload);

    // Call the prediction API
    const prediction = await predictAmmonia(payload);

    // Get status based on prediction
    const { status, className } = getAmmoniaStatus(prediction);

    // Update UI elements
    const predictedAmmoniaEl = document.getElementById("predictedAmmonia");
    const predictionStatusEl = document.getElementById("predictionStatus");

    if (predictedAmmoniaEl) {
      predictedAmmoniaEl.textContent = prediction.toFixed(3);
    }

    if (predictionStatusEl) {
      // Update status text
      const statusTextEl = predictionStatusEl.querySelector(".status-text");
      if (statusTextEl) {
        statusTextEl.textContent = status;
      }

      // Update status indicator with appropriate class
      const statusIndicatorEl = predictionStatusEl.querySelector(".status-indicator");
      if (statusIndicatorEl) {
        statusIndicatorEl.className = `status-indicator ${className}`;
      }

      // Apply status class to the parent for styling
      predictionStatusEl.className = `prediction-status ${className}`;
    }

    console.log(`✅ Ammonia prediction: ${prediction.toFixed(3)} ppm - ${status}`);
  } catch (error) {
    console.error("❌ Prediction failed:", error);
    alert(`❌ Prediction failed: ${error.message}`);

    // Reset UI to show error state
    const predictedAmmoniaEl = document.getElementById("predictedAmmonia");
    const predictionStatusEl = document.getElementById("predictionStatus");

    if (predictedAmmoniaEl) {
      predictedAmmoniaEl.textContent = "Error";
    }

    if (predictionStatusEl) {
      const statusTextEl = predictionStatusEl.querySelector(".status-text");
      if (statusTextEl) {
        statusTextEl.textContent = "Prediction failed";
      }
      const statusIndicatorEl = predictionStatusEl.querySelector(".status-indicator");
      if (statusIndicatorEl) {
        statusIndicatorEl.className = "status-indicator danger";
      }
      predictionStatusEl.className = "prediction-status danger";
    }
  } finally {
    // Re-enable button and restore label
    btn.disabled = false;
    btn.textContent = "Predict End-of-Day Ammonia";
    btn.classList.remove("loading");
  }
}

/**
 * Save tank settings via API
 */
async function saveSettings(event) {
  event.preventDefault();

  const volumeInput = document.getElementById("volumeInput");
  const levelInput = document.getElementById("targetLevelInput");
  const fishSmallInput = document.getElementById("fishSmallInput");
  const fishMediumInput = document.getElementById("fishMediumInput");
  const fishLargeInput = document.getElementById("fishLargeInput");
  const fishExtraLargeInput = document.getElementById("fishExtraLargeInput");

  if (!volumeInput || !levelInput || !fishSmallInput || !fishMediumInput || !fishLargeInput || !fishExtraLargeInput) {
    console.warn("⚠️ Settings form inputs not found on this page.");
    return;
  }

  const settings = {
    tank_id: "tank_001",
    tank_volume_liters: parseInt(volumeInput.value, 10),
    appropriate_water_level: parseInt(levelInput.value, 10),
    fish_small: parseInt(fishSmallInput.value, 10),
    fish_medium: parseInt(fishMediumInput.value, 10),
    fish_large: parseInt(fishLargeInput.value, 10),
    fish_xlarge: parseInt(fishExtraLargeInput.value, 10),
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
      appropriate_water_level: settings.appropriate_water_level,
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
  if (!message) return;
  message.textContent = text;
  message.className = `message ${type}`;
}

/**
 * Prediction panel (placeholder)
 */
function updatePredictionPanel() {
  const predictedValue = getPredictedAmmonia();

  const predictedEl = document.getElementById("predictedAmmonia");
  const statusElement = document.getElementById("predictionStatus");
  if (!predictedEl || !statusElement) return;

  const indicator = statusElement.querySelector(".status-indicator");
  const text = statusElement.querySelector(".status-text");
  if (!indicator || !text) return;

  predictedEl.textContent = predictedValue.toFixed(2);

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
 * Load feeding events from API
 */
async function loadFeedingEvents() {
  try {
    const response = await fetch(`${API_BASE}/feeding-events?tank_id=tank_001&device_id=aquasense_01`);

    if (!response.ok) {
      throw new Error(`Feeding events API error: ${response.status}`);
    }

    let events = await response.json();

    // Handle both array and { items: [...] } response formats
    if (events && events.items) {
      events = events.items;
    } else if (!Array.isArray(events)) {
      events = [];
    }
    
    // Include any non-pending events in history
    events = events.filter(event => (event.status || "").toLowerCase() !== "pending");

    // Sort by created_at/timestamp descending (most recent first)
    events.sort((a, b) => {
      const timeA = new Date(a.created_at || a.timestamp || 0);
      const timeB = new Date(b.created_at || b.timestamp || 0);
      return timeB - timeA;
    });

    // Take top 20
    events = events.slice(0, 20);

    renderFeedingHistory(events);
    console.log(`📋 Feeding events loaded: ${events.length} event(s)`);
  } catch (error) {
    console.error("❌ Failed to load feeding events:", error);
    renderFeedingHistory([]);
  }
}

/**
 * Render feeding history table
 */
function renderFeedingHistory(events) {
  const tableBody = document.getElementById("feedingTableBody");
  if (!tableBody) return;

  if (!events || events.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 2rem;">
          <div class="feeding-empty-state">
            <i class="fas fa-calendar-times"></i>
            <p>No feeding events yet</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = events
    .map((event) => {
      // Use feedtime for display (the scheduled feed time), not timestamp (when posted)
      const feedTimeValue = event.feedtime || event.timestamp || event.created_at;
      const feedTime = feedTimeValue ? new Date(feedTimeValue) : null;
      const formattedFeedTime = feedTime && !isNaN(feedTime)
        ? feedTime.toISOString().replace("T", " ").substring(0, 19)
        : "N/A";
      const quantity = event.feed_quantity_g ?? event.quantity_grams ?? event.quantity ?? "N/A";
      const tankId = event.tank_id || "tank_001";
      const status = event.status || "success";
      let statusClass = "success";
      if (status === "pending") statusClass = "pending";
      else if (status === "failed") statusClass = "failed";

      return `
        <tr>
          <td class="timestamp">${formattedFeedTime}</td>
          <td>${quantity}g</td>
          <td>${tankId}</td>
          <td><span class="status-badge ${statusClass}">${status}</span></td>
        </tr>
      `;
    })
    .join("");

  console.log("📊 Feeding history rendered");
}

/**
 * Refresh feeding history
 */
async function refreshFeedingHistory() {
  const refreshBtn = document.getElementById("refreshFeedingBtn");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
  }

  try {
    await loadFeedingEvents();
  } catch (error) {
    console.error("❌ Failed to refresh feeding history:", error);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<i class="fas fa-redo"></i> Refresh';
    }
  }
}

/**
 * Load pending feedings from API
 */
async function loadPendingFeedings() {
  try {
    const response = await fetch(`${API_BASE}/feeding-events?tank_id=tank_001`);

    if (!response.ok) {
      throw new Error(`Pending feedings API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter for pending/scheduled events
    const pendingEvents = (data.items || []).filter(event => 
      (event.status || "").toLowerCase() === "pending"
    );

    renderPendingFeedings(pendingEvents);
    console.log(`📋 Loaded ${pendingEvents.length} pending feeding(s)`);
  } catch (error) {
    console.error("❌ Failed to load pending feedings:", error);
    renderPendingFeedings([]);
  }
}

/**
 * Render pending feedings table
 */
function renderPendingFeedings(events) {
  const tableBody = document.getElementById("pendingFeedingsTableBody");
  if (!tableBody) return;

  if (!events || events.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 2rem;">
          <div class="feeding-empty-state">
            <i class="fas fa-calendar-check"></i>
            <p>No pending feedings scheduled</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = events
    .map((event) => {
      // Use feedtime for display (the scheduled feed time), not timestamp (when posted)
      const feedTimeValue = event.feedtime || event.timestamp || event.created_at;
      const feedTime = feedTimeValue ? new Date(feedTimeValue) : null;
      const formattedFeedTime = feedTime && !isNaN(feedTime)
        ? feedTime.toLocaleString()
        : "N/A";
      const quantity = event.feed_quantity_g ?? event.quantity_grams ?? event.quantity ?? "N/A";
      const status = event.status || "pending";
      const tankId = event.tank_id || "tank_001";
      const timestampValue = event.timestamp || event.created_at;

      let statusClass = "pending";
      if (status === "success") statusClass = "success";
      else if (status === "failed") statusClass = "failed";

      // Encode timestamp for URL
      const encodedTimestamp = encodeURIComponent(timestampValue);

      return `
        <tr data-timestamp="${timestampValue}" data-tank-id="${tankId}">
          <td class="timestamp">${formattedFeedTime}</td>
          <td><span id="qty-${encodedTimestamp}">${quantity}g</span></td>
          <td><span class="status-badge ${statusClass}">${status}</span></td>
          <td class="actions-cell">
            <button class="btn-action btn-edit" onclick="editPendingFeeding('${feedTimeValue}', '${tankId}', ${quantity})" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-action btn-delete" onclick="deletePendingFeeding('${feedTimeValue}', '${tankId}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  console.log("📊 Pending feedings rendered");
}

/**
 * Edit pending feeding
 */
function editPendingFeeding(timestamp, tankId, currentQty) {
  // Open modal and populate with current values
  const modal = document.getElementById("editPendingModal");
  const timeInput = document.getElementById("editFeedingTime");
  const qtyInput = document.getElementById("editFeedingQty");
  const originalTimestampInput = document.getElementById("editFeedingOriginalTimestamp");
  const tankIdInput = document.getElementById("editFeedingTankId");
  
  if (!modal || !timeInput || !qtyInput) return;
  
  // Set current values
  timeInput.value = timestamp.slice(0, 16); // YYYY-MM-DDTHH:mm
  qtyInput.value = currentQty;
  originalTimestampInput.value = timestamp;
  tankIdInput.value = tankId;
  
  // Show modal
  modal.classList.add("show");
  
  // Clear any previous messages
  const messageEl = document.getElementById("editPendingMessage");
  if (messageEl) {
    messageEl.textContent = "";
    messageEl.className = "message";
  }
}

/**
 * Close edit pending modal
 */
function closeEditPendingModal() {
  const modal = document.getElementById("editPendingModal");
  if (modal) {
    modal.classList.remove("show");
  }
}

/**
 * Handle edit pending form submission
 */
async function handleEditPendingSubmit(event) {
  event.preventDefault();
  
  const timeInput = document.getElementById("editFeedingTime");
  const qtyInput = document.getElementById("editFeedingQty");
  const originalTimestampInput = document.getElementById("editFeedingOriginalTimestamp");
  const tankIdInput = document.getElementById("editFeedingTankId");
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const messageEl = document.getElementById("editPendingMessage");
  
  const newDatetime = timeInput.value;
  const qty = parseFloat(qtyInput.value);
  const originalTimestamp = originalTimestampInput.value;
  const tankId = tankIdInput.value;
  
  if (!newDatetime || isNaN(qty) || qty < 0 || qty > 10) {
    if (messageEl) {
      messageEl.textContent = "Please enter valid date/time and quantity (0-10g)";
      messageEl.className = "message error";
    }
    return;
  }
  
  // Disable button during submission
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";
  }
  
  try {
    const newTimestamp = newDatetime + ":00";
    
    const payload = {
      tank_id: tankId,
      timestamp: originalTimestamp, // Original timestamp for identification
      new_timestamp: newTimestamp, // New timestamp if changed
      feed_quantity_g: qty,
      event_type: "SCHEDULE_UPDATED",
      status: "pending",
    };

    const response = await fetch(`${API_BASE}/feeding-events`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          console.error("Backend error response:", errorBody);
          errorMessage = errorBody;
        }
      } catch (e) {
        // Unable to parse response body
      }
      throw new Error(errorMessage);
    }

    console.log("✅ Pending feeding updated successfully");
    
    if (messageEl) {
      messageEl.textContent = "✅ Feeding updated successfully!";
      messageEl.className = "message success";
    }
    
    // Refresh both tables
    await loadPendingFeedings();
    await loadFeedingEvents();
    
    // Close modal after short delay
    setTimeout(() => {
      closeEditPendingModal();
    }, 1500);
  } catch (error) {
    console.error("❌ Failed to update pending feeding:", error);
    if (messageEl) {
      messageEl.textContent = `❌ Failed to update: ${error.message}`;
      messageEl.className = "message error";
    }
  } finally {
    // Re-enable button
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Update Feeding";
    }
  }
}

/**
 * Delete pending feeding
 */
function deletePendingFeeding(timestamp, tankId) {
  // Open modal and show details
  const modal = document.getElementById("deletePendingModal");
  const detailsEl = document.getElementById("deleteConfirmationDetails");
  
  if (!modal) return;
  
  // Store data in modal for confirmation
  modal.dataset.timestamp = timestamp;
  modal.dataset.tankId = tankId;
  
  // Show feeding details
  if (detailsEl) {
    const formattedTime = new Date(timestamp).toLocaleString();
    detailsEl.textContent = `Scheduled for: ${formattedTime}`;
  }
  
  // Show modal
  modal.classList.add("show");
  
  // Clear any previous messages
  const messageEl = document.getElementById("deletePendingMessage");
  if (messageEl) {
    messageEl.textContent = "";
    messageEl.className = "message";
  }
}

/**
 * Close delete pending modal
 */
function closeDeletePendingModal() {
  const modal = document.getElementById("deletePendingModal");
  if (modal) {
    modal.classList.remove("show");
  }
}

/**
 * Confirm and execute delete
 */
async function confirmDeletePending() {
  const modal = document.getElementById("deletePendingModal");
  if (!modal) return;
  
  const timestamp = modal.dataset.timestamp;
  const tankId = modal.dataset.tankId;
  const messageEl = document.getElementById("deletePendingMessage");
  const deleteBtn = modal.querySelector(".btn-delete-confirm");
  
  if (!timestamp || !tankId) return;
  
  // Disable button during submission
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting...";
  }

  try {
    const url = `${API_BASE}/feeding-events?tank_id=${encodeURIComponent(tankId)}&timestamp=${encodeURIComponent(timestamp)}`;
    
    const response = await fetch(url, {
      method: "DELETE",
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          console.error("Backend error response:", errorBody);
          errorMessage = errorBody;
        }
      } catch (e) {
        // Unable to parse response body
      }
      throw new Error(errorMessage);
    }

    console.log("✅ Pending feeding deleted successfully");
    
    if (messageEl) {
      messageEl.textContent = "✅ Feeding deleted successfully!";
      messageEl.className = "message success";
    }
    
    // Refresh both tables
    await loadPendingFeedings();
    await loadFeedingEvents();
    
    // Close modal after short delay
    setTimeout(() => {
      closeDeletePendingModal();
    }, 1500);
  } catch (error) {
    console.error("❌ Failed to delete pending feeding:", error);
    if (messageEl) {
      messageEl.textContent = `❌ Failed to delete: ${error.message}`;
      messageEl.className = "message error";
    }
  } finally {
    // Re-enable button
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete Feeding";
    }
  }
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
      if (currentPage === "monitoring") {
        await Promise.all([loadTankProfile(), loadSensorData()]);
      } else if (currentPage === "feeding") {
        await loadFeedingEvents();
      } else {
        await loadTankProfile();
      }
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
const modalEl = document.getElementById("settingsModal");
if (modalEl) {
  modalEl.addEventListener("click", function (event) {
    if (event.target === this) closeSettingsModal();
  });
}

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

// Direct global access for inline handlers
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.refreshFeedingHistory = refreshFeedingHistory;
window.loadPendingFeedings = loadPendingFeedings;
window.editPendingFeeding = editPendingFeeding;
window.deletePendingFeeding = deletePendingFeeding;
window.closeEditPendingModal = closeEditPendingModal;
window.closeDeletePendingModal = closeDeletePendingModal;
window.confirmDeletePending = confirmDeletePending;
window.onPredictAmmoniaClick = onPredictAmmoniaClick;

console.log("AquaScope Dashboard JavaScript loaded successfully");
