/**
 * AquaScope Dashboard - JavaScript Application
 * 
 * This application provides real-time monitoring and control for smart aquarium systems.
 * Features include sensor data visualization, tank configuration, and ML-based predictions.
 * 
 * Author: Senior Frontend Engineer
 * Version: 1.0.0
 * Date: February 2026
 */

// API Configuration - AWS Lambda endpoints
const API_BASE = "https://tfswuifr58.execute-api.ap-southeast-2.amazonaws.com";

// Application state
let currentTimeline = 'day';
let charts = {};
let refreshInterval;
let retryTimeouts = {};

// Timeline configurations - maps to API period parameter
const TIMELINE_CONFIG = {
    day: { period: '1d', label: '1 Day' },
    week: { period: '1w', label: '1 Week' },
    month: { period: '1m', label: '1 Month' }
};

// Chart color schemes
const CHART_COLORS = {
    temperature: '#e74c3c',
    ph: '#3498db',
    ammonia: '#f39c12',
    waterLevel: '#2ecc71'
};

/**
 * Application initialization
 * Sets up event listeners, loads initial data, and starts auto-refresh
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌊 AquaScope Dashboard initializing...');
    
    // Initialize the application
    initializeApplication();
});

/**
 * Main application initialization function
 */
async function initializeApplication() {
    try {
        // Load tank profile and initial sensor data
        await Promise.all([
            loadTankProfile(),
            loadSensorData()
        ]);
        
        // Update prediction panel
        updatePredictionPanel();
        
        // Start auto-refresh cycle
        startAutoRefresh();
        
        console.log('✅ AquaScope Dashboard initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize dashboard:', error);
        showErrorMessage('Failed to load dashboard data. Retrying...');
        
        // Retry initialization after 5 seconds
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
        
        console.log('📊 Tank profile loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load tank profile:', error);
        
        // Show placeholder data
        updateTankDisplay({
            volume: 'N/A',
            target_water_level: 'N/A',
            fish_count: {
                small: 'N/A',
                medium: 'N/A',
                large: 'N/A',
                extra_large: 'N/A'
            }
        });
        
        // Retry after 60 seconds
        retryTimeouts.tankProfile = setTimeout(loadTankProfile, 60000);
    }
}

/**
 * Update tank information display
 * @param {Object} profile - Tank profile data
 */
function updateTankDisplay(profile) {
    // Handle both API response schemas with safe fallbacks
    const volume = profile.tank_volume_liters ?? profile.volume ?? 'N/A';
    const targetWaterLevel = profile.target_water_level ?? 'N/A';
    
    document.getElementById('tankVolume').textContent = volume;
    document.getElementById('targetWaterLevel').textContent = targetWaterLevel;
    
    // Update fish counts - handle both flat and nested schemas
    const fishSmall = profile.fish_small ?? profile.fish_count?.small ?? '0';
    const fishMedium = profile.fish_medium ?? profile.fish_count?.medium ?? '0';
    const fishLarge = profile.fish_large ?? profile.fish_count?.large ?? '0';
    const fishXLarge = profile.fish_xlarge ?? profile.fish_count?.extra_large ?? '0';
    
    document.getElementById('fishSmall').textContent = fishSmall;
    document.getElementById('fishMedium').textContent = fishMedium;
    document.getElementById('fishLarge').textContent = fishLarge;
    document.getElementById('fishExtraLarge').textContent = fishXLarge;
    
    // Store for settings modal
    window.currentProfile = profile;
}

/**
 * Load sensor data based on current timeline selection
 * Uses backend-driven time filtering via period query parameter
 */
async function loadSensorData() {
    const config = TIMELINE_CONFIG[currentTimeline];
    
    try {
        showLoading(true);
        
        // Build API URL with backend-driven period filtering
        const url = `${API_BASE}/readings?device_id=aquasense_01&period=${config.period}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Sensor data API error: ${response.status}`);
        }
        
        const responseData = await response.json();
        
        // Parse new API response format
        if (responseData && responseData.items && Array.isArray(responseData.items)) {
            const readings = responseData.items;
            
            if (readings.length > 0) {
                updateCharts(readings);
                hideChartPlaceholders();
                console.log(`📈 Loaded ${readings.length} sensor readings for ${config.label} (${responseData.start} to ${responseData.end})`);
            } else {
                // API returned count === 0
                throw new Error('No sensor data available for selected period');
            }
        } else {
            throw new Error('Invalid API response format');
        }
        
    } catch (error) {
        console.error('❌ Failed to load sensor data:', error);
        showChartPlaceholders();
        
        // Clear existing retry timeout
        if (retryTimeouts.sensorData) {
            clearTimeout(retryTimeouts.sensorData);
        }
        
        // Retry after 60 seconds
        retryTimeouts.sensorData = setTimeout(loadSensorData, 60000);
        
    } finally {
        showLoading(false);
    }
}

/**
 * Update all charts with new sensor data
 * @param {Array} readings - Array of sensor readings
 */
function updateCharts(readings) {
    // Process data for charts
    const chartData = processChartData(readings);
    
    // Update or create charts
    updateChart('temperatureChart', 'Temperature (°C)', chartData.temperature, CHART_COLORS.temperature);
    updateChart('phChart', 'pH Level', chartData.ph, CHART_COLORS.ph);
    updateChart('ammoniaChart', 'Ammonia (ppm)', chartData.ammonia, CHART_COLORS.ammonia);
    updateChart('waterLevelChart', 'Water Level (%)', chartData.waterLevel, CHART_COLORS.waterLevel);
}

/**
 * Process raw sensor readings into chart-ready format
 * @param {Array} readings - Raw sensor readings
 * @returns {Object} Processed data for charts
 */
function processChartData(readings) {
    // Sort readings by timestamp
    readings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    return {
        temperature: readings.map(reading => ({
            x: new Date(reading.timestamp),
            y: parseFloat(reading.temperature) || 0
        })),
        ph: readings.map(reading => ({
            x: new Date(reading.timestamp),
            y: parseFloat(reading.ph) || 0
        })),
        ammonia: readings.map(reading => ({
            x: new Date(reading.timestamp),
            y: parseFloat(reading.ammonia) || 0
        })),
        waterLevel: readings.map(reading => ({
            x: new Date(reading.timestamp),
            y: parseFloat(reading.water_level) || 0
        }))
    };
}

/**
 * Update or create a Chart.js chart
 * @param {string} canvasId - Canvas element ID
 * @param {string} label - Chart label
 * @param {Array} data - Chart data points
 * @param {string} color - Line color
 */
function updateChart(canvasId, label, data, color) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    
    // Create new chart
    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: label,
                data: data,
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: 1,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        tooltipFormat: 'MMM DD, HH:mm',
                        displayFormats: {
                            hour: 'HH:mm',
                            day: 'MMM DD',
                            week: 'MMM DD',
                            month: 'MMM DD'
                        }
                    },
                    grid: {
                        color: '#e9ecef'
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: '#e9ecef'
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            animation: {
                duration: 500
            }
        }
    });
}

/**
 * Show chart placeholders when data is unavailable
 */
function showChartPlaceholders() {
    const placeholders = ['temperaturePlaceholder', 'phPlaceholder', 'ammoniaPlaceholder', 'waterLevelPlaceholder'];
    placeholders.forEach(id => {
        const placeholder = document.getElementById(id);
        if (placeholder) {
            placeholder.classList.add('show');
        }
    });
}

/**
 * Hide chart placeholders when data is available
 */
function hideChartPlaceholders() {
    const placeholders = ['temperaturePlaceholder', 'phPlaceholder', 'ammoniaPlaceholder', 'waterLevelPlaceholder'];
    placeholders.forEach(id => {
        const placeholder = document.getElementById(id);
        if (placeholder) {
            placeholder.classList.remove('show');
        }
    });
}

/**
 * Timeline selector event handler - dropdown only
 * @param {string} period - Selected time period ('day', 'week', 'month')
 */
function selectTimeline(period) {
    // Update current timeline
    currentTimeline = period;
    
    // Update dropdown value if called programmatically
    const dropdown = document.getElementById('timelineSelect');
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
    // Populate form with current values - handle both API schemas
    const profile = window.currentProfile || {};
    
    const volume = profile.tank_volume_liters ?? profile.volume ?? '';
    const targetLevel = profile.target_water_level ?? '';
    const fishSmall = profile.fish_small ?? profile.fish_count?.small ?? 0;
    const fishMedium = profile.fish_medium ?? profile.fish_count?.medium ?? 0;
    const fishLarge = profile.fish_large ?? profile.fish_count?.large ?? 0;
    const fishXLarge = profile.fish_xlarge ?? profile.fish_count?.extra_large ?? 0;
    
    document.getElementById('volumeInput').value = volume;
    document.getElementById('targetLevelInput').value = targetLevel;
    document.getElementById('fishSmallInput').value = fishSmall;
    document.getElementById('fishMediumInput').value = fishMedium;
    document.getElementById('fishLargeInput').value = fishLarge;
    document.getElementById('fishExtraLargeInput').value = fishXLarge;
    
    // Clear any previous messages
    const message = document.getElementById('settingsMessage');
    message.className = 'message';
    message.textContent = '';
    
    // Show modal
    document.getElementById('settingsModal').classList.add('show');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('show');
}

/**
 * Save tank settings via API
 * @param {Event} event - Form submit event
 */
async function saveSettings(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Send settings in the flat schema format expected by API
    const settings = {
        tank_id: 'tank_001',
        tank_volume_liters: parseInt(document.getElementById('volumeInput').value),
        target_water_level: parseInt(document.getElementById('targetLevelInput').value),
        fish_small: parseInt(document.getElementById('fishSmallInput').value),
        fish_medium: parseInt(document.getElementById('fishMediumInput').value),
        fish_large: parseInt(document.getElementById('fishLargeInput').value),
        fish_xlarge: parseInt(document.getElementById('fishExtraLargeInput').value),
        updated_at: new Date().toISOString()
    };
    
    try {
        const response = await fetch(`${API_BASE}/tank-profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            throw new Error(`Settings API error: ${response.status}`);
        }
        
        // Update display with new settings (convert back to display format)
        const displaySettings = {
            tank_volume_liters: settings.tank_volume_liters,
            target_water_level: settings.target_water_level,
            fish_small: settings.fish_small,
            fish_medium: settings.fish_medium,
            fish_large: settings.fish_large,
            fish_xlarge: settings.fish_xlarge
        };
        updateTankDisplay(displaySettings);
        
        // Show success message
        showSettingsMessage('Settings saved successfully!', 'success');
        
        // Close modal after 2 seconds
        setTimeout(closeSettingsModal, 2000);
        
        console.log('✅ Tank settings saved successfully');
        
    } catch (error) {
        console.error('❌ Failed to save settings:', error);
        showSettingsMessage('Failed to save settings. Please try again.', 'error');
    }
}

/**
 * Show message in settings modal
 * @param {string} text - Message text
 * @param {string} type - Message type ('success' or 'error')
 */
function showSettingsMessage(text, type) {
    const message = document.getElementById('settingsMessage');
    message.textContent = text;
    message.className = `message ${type}`;
}

/**
 * Update ammonia prediction panel
 * TODO: Replace with SageMaker ML endpoint integration
 */
function updatePredictionPanel() {
    // Placeholder prediction function - Replace with actual SageMaker endpoint
    const predictedValue = getPredictedAmmonia();
    
    document.getElementById('predictedAmmonia').textContent = predictedValue.toFixed(2);
    
    // Update status based on prediction
    const statusElement = document.getElementById('predictionStatus');
    const indicator = statusElement.querySelector('.status-indicator');
    const text = statusElement.querySelector('.status-text');
    
    if (predictedValue <= 0.25) {
        indicator.className = 'status-indicator safe';
        text.textContent = 'Safe';
    } else if (predictedValue <= 0.5) {
        indicator.className = 'status-indicator caution';
        text.textContent = 'Caution';
    } else {
        indicator.className = 'status-indicator danger';
        text.textContent = 'Dangerous';
    }
}

/**
 * Placeholder function for ammonia prediction
 * TODO: Replace with SageMaker prediction API
 * This function will be replaced with a call to AWS SageMaker endpoint
 * for real-time ammonia level predictions based on current sensor readings,
 * feeding patterns, and historical data.
 * 
 * @returns {number} Predicted ammonia level in ppm
 */
function getPredictedAmmonia() {
    // TODO: Replace with SageMaker prediction API
    // Mock value for now
    return 0.48; // Placeholder prediction value
}

/**
 * Auto-refresh functionality
 */
function startAutoRefresh() {
    // Clear existing interval
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // Set up new refresh interval (60 seconds)
    refreshInterval = setInterval(async () => {
        console.log('🔄 Auto-refreshing dashboard data...');
        
        try {
            await Promise.all([
                loadTankProfile(),
                loadSensorData()
            ]);
            
            updatePredictionPanel();
            
        } catch (error) {
            console.error('❌ Auto-refresh failed:', error);
        }
    }, 60000);
    
    console.log('⏰ Auto-refresh started (60-second interval)');
}

/**
 * Loading indicator functions
 */
function showLoading(show) {
    const indicator = document.getElementById('loadingIndicator');
    if (show) {
        indicator.classList.add('show');
    } else {
        indicator.classList.remove('show');
    }
}

/**
 * Error message display
 */
function showErrorMessage(message) {
    // You can enhance this to show a toast notification
    console.error('🚨 Error:', message);
}

/**
 * Utility function to format timestamps
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
}

/**
 * Cleanup function for when page is unloaded
 */
window.addEventListener('beforeunload', function() {
    // Clear intervals and timeouts
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    Object.values(retryTimeouts).forEach(timeout => {
        clearTimeout(timeout);
    });
    
    // Destroy charts
    Object.values(charts).forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
    
    console.log('🧹 Dashboard cleanup completed');
});

// Modal event listeners for better UX
document.addEventListener('keydown', function(event) {
    // Close modal on Escape key
    if (event.key === 'Escape') {
        closeSettingsModal();
    }
});

// Click outside modal to close
document.getElementById('settingsModal').addEventListener('click', function(event) {
    if (event.target === this) {
        closeSettingsModal();
    }
});

/**
 * Responsive chart handling
 */
window.addEventListener('resize', function() {
    // Debounce resize events
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        // Trigger chart resize
        Object.values(charts).forEach(chart => {
            if (chart) {
                chart.resize();
            }
        });
    }, 250);
});

// Export functions for global access (if needed)
window.AquaScope = {
    selectTimeline,
    openSettingsModal,
    closeSettingsModal,
    saveSettings,
    getPredictedAmmonia
};

console.log('AquaScope Dashboard JavaScript loaded successfully');