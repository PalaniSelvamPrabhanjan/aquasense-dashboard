# AquaSense Dashboard

A web-based IoT aquarium monitoring dashboard hosted on AWS Amplify, built as a single-page web application using HTML, CSS, and vanilla JavaScript.

## 🌊 Project Overview

AquaSense Dashboard provides real-time monitoring for smart aquarium systems. The application displays sensor data through interactive Chart.js line charts with time-based x-axis, allowing users to monitor water quality metrics across different time periods.

### Monitored Metrics

- **Temperature** (°C)
- **pH**
- **Ammonia** (ppm)
- **Water Level** (%)

### Key Features

- **Real-time Monitoring**: Live sensor data visualization using Chart.js line charts
- **Timeline Selection**: Backend-driven data retrieval for different periods (1 Day, 1 Week, 1 Month)
- **Responsive Design**: Optimized for desktop and mobile devices
- **Predicted Ammonia**: End-of-day ammonia prediction panel (currently placeholder)
- **Error Handling**: Graceful degradation with placeholder messages and automatic retry

## 🏗️ Architecture Overview

The AquaSense system follows a serverless IoT architecture:

```
IoT Device → DynamoDB → Lambda → API Gateway (HTTP API) → Frontend (Amplify)
```

### Components
- **IoT Device**: Sensors collecting aquarium data
- **DynamoDB**: Time-series data storage
- **Lambda**: Data processing and API logic
- **API Gateway**: HTTP API for frontend communication
- **Frontend**: Static web application hosted on AWS Amplify

## 🔌 API Integration

### Base URL
```javascript
const API_BASE = "https://tfswuifr58.execute-api.ap-southeast-2.amazonaws.com";
```

### Readings Endpoint

**GET** `/readings`

| Parameter | Type | Options | Description |
|-----------|------|---------|-------------|
| `device_id` | string | `aquasense_01` | Device identifier |
| `period` | string | `1d` \| `1w` \| `1m` | Time period for data retrieval |

#### Sample Request
```
GET /readings?device_id=aquasense_01&period=1d
```

#### Sample Response
```json
{
  "readings": [
    {
      "timestamp": "2026-02-02T10:00:00Z",
      "temperature": 24.5,
      "ph": 7.2,
      "ammonia": 0.15,
      "water_level": 85.3
    },
    {
      "timestamp": "2026-02-02T10:05:00Z",
      "temperature": 24.6,
      "ph": 7.1,
      "ammonia": 0.16,
      "water_level": 85.1
    }
  ]
}
```

### Timeline Functionality

The timeline dropdown triggers backend-driven data retrieval:
- **Frontend does not trim or filter historical data**
- **Each timeline selection triggers a new API request**
- **Period parameter determines data scope**: `1d`, `1w`, or `1m`

## 🎯 Core Components

### 1. Water Quality Charts
- **Temperature Chart**: Real-time temperature monitoring (°C)
- **pH Chart**: Water acidity level tracking
- **Ammonia Chart**: Toxic level monitoring (ppm)
- **Water Level Chart**: Tank capacity monitoring (%)

All charts use Chart.js line charts with time-based x-axis for temporal data visualization.

### 2. Timeline Selector
- Interactive dropdown for different time periods (1 Day / 1 Week / 1 Month)
- Backend-driven data loading based on selection
- Each selection triggers new API request with period parameter

### 3. Predicted End-of-Day Ammonia Panel
- **Current Status**: Uses placeholder value
- **Implementation**: Not connected to machine learning model
- Color-coded status indicators:
  - 🟢 **Safe**: ≤ 0.25 ppm
  - 🟡 **Caution**: 0.25 - 0.5 ppm
  - 🔴 **Dangerous**: > 0.5 ppm

## 🛡️ Error Handling

### Frontend Error Management
- **Data Unavailable**: Placeholder message displayed when API fails
- **Network Issues**: Automatic retry behavior for failed requests
- **Chart Errors**: Graceful fallback to error state display

## 🚀 Hosting with AWS Amplify

The AquaSense dashboard is deployed as a static web application on AWS Amplify, providing:
- **Continuous Deployment**: Automatic builds from source repository
- **Global CDN**: Fast content delivery through CloudFront
- **HTTPS**: SSL/TLS encryption for secure connections
- **Custom Domains**: Production-ready URL management

### Static File Structure
```
/
├── index.html          # Main application entry point
├── styles.css          # Complete styling system
├── app.js             # JavaScript application logic
└── README.md          # Project documentation
```

## 🔧 Development

### Frontend Stack
- **HTML5**: Semantic structure
- **CSS3**: Modern styling with Flexbox and CSS Grid
- **Vanilla JavaScript**: ES6+ with async/await
- **Chart.js**: Data visualization library

### Local Development
1. Clone the repository
2. Open `index.html` in a modern browser
3. Use browser developer tools for debugging
4. Test responsive design with device emulation

## 🚀 Future Enhancements

### Planned Features
- [ ] **SageMaker Integration**: ML-powered ammonia predictions using AWS SageMaker
- [ ] **Authentication**: User management with AWS Cognito
- [ ] **Multi-tank Support**: Monitor multiple aquarium systems
- [ ] **Alerts**: Real-time notifications via AWS SNS
- [ ] **Analytics**: Advanced data analysis using AWS IoT Analytics and S3

## 📄 License

This project is developed for educational purposes as part of the AquaSense IoT system.

---

**Version**: 1.0.0  
**Last Updated**: February 2026  
**Built with**: ❤️ for aquarium enthusiasts



