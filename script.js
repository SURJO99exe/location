document.addEventListener('DOMContentLoaded', () => {
    const ipInput = document.getElementById('ip-input');
    const traceBtn = document.getElementById('trace-btn');
    const loadingDiv = document.getElementById('loading');
    const resultDiv = document.getElementById('result');
    const errorDiv = document.getElementById('error');
    const errorMsg = document.getElementById('error-msg');

    const resIp = document.getElementById('res-ip');
    const resCountry = document.getElementById('res-country');
    const resRegion = document.getElementById('res-region');
    const resCity = document.getElementById('res-city');
    const resLat = document.getElementById('res-lat');
    const resLon = document.getElementById('res-lon');
    const resIsp = document.getElementById('res-isp');
    const resOrg = document.getElementById('res-org');
    const resTz = document.getElementById('res-tz');

    let map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    let marker;
    let circle;
    let countryLayer;

    const traceIP = async (ip = '') => {
        showLoading();
        try {
            const response = await fetch(`https://ip-api.com/json/${ip}?fields=status,message,continent,continentCode,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,offset,currency,isp,org,as,asname,mobile,proxy,hosting,query`);
            const data = await response.json();

            if (data.status === 'fail') {
                throw new Error(data.message || 'Invalid IP Address');
            }

            displayResult(data);
        } catch (err) {
            showError(err.message);
        } finally {
            hideLoading();
        }
    };

    const displayResult = async (data) => {
        const lat = data.lat;
        const lng = data.lon;

        // Perform reverse geocoding using Nominatim (OpenStreetMap)
        let addressData = {
            full: 'Fetching detailed address...',
            village: '-',
            upazila: '-',
            district: '-',
            division: '-'
        };

        try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const geoData = await geoRes.json();
            
            if (geoData && geoData.address) {
                const addr = geoData.address;
                addressData.full = geoData.display_name || 'N/A';
                addressData.village = addr.village || addr.suburb || addr.neighbourhood || addr.residential || addr.road || '-';
                addressData.upazila = addr.subdistrict || addr.county || '-';
                addressData.district = addr.district || addr.state_district || addr.city || '-';
                addressData.division = addr.state || '-';
            }
        } catch (err) {
            console.error("Reverse geocoding failed:", err);
            addressData.full = `${data.city}, ${data.country}`;
        }

        const fields = [
            { id: 'res-ip', value: data.query },
            { id: 'res-continent', value: data.continent || '-' },
            { id: 'res-country', value: `${data.country} (${data.countryCode})` },
            { id: 'res-full-address', value: addressData.full },
            { id: 'res-village', value: addressData.village },
            { id: 'res-upazila', value: addressData.upazila },
            { id: 'res-district', value: addressData.district },
            { id: 'res-division', value: addressData.division },
            { id: 'res-zip', value: data.zip || '-' },
            { id: 'res-lat', value: data.lat },
            { id: 'res-lon', value: data.lon },
            { id: 'res-timezone', value: data.timezone || '-' },
            { id: 'res-currency', value: data.currency || '-' },
            { id: 'res-isp', value: data.isp },
            { id: 'res-org', value: data.org || 'N/A' },
            { id: 'res-as', value: data.as || '-' },
            { id: 'res-mobile', value: data.mobile ? 'YES' : 'NO' },
            { id: 'res-proxy', value: data.proxy ? 'YES' : 'NO' },
            { id: 'res-hosting', value: data.hosting ? 'YES' : 'NO' },
            { id: 'res-security', value: 'DANGER ZONE [RESTRICTED]' }
        ];

        resultDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');

        // Dynamic zone logic (Simulated for demonstration)
        // Division-level safe zone if division is 'Dhaka Division' or similar
        // Country-level danger zone if country is 'Bangladesh'
        const isDivisionSafe = addressData.division.toLowerCase().includes('dhaka') || addressData.division.toLowerCase().includes('chittagong');
        const isCountryDanger = data.country.toLowerCase().includes('bangladesh');
        
        let zoneColor = '#ff0000'; // Default Danger
        let zoneLabel = 'DANGER ZONE [COUNTRY LEVEL]';

        if (isDivisionSafe) {
            zoneColor = '#00ff00';
            zoneLabel = 'SAFE ZONE [DIVISION LEVEL]';
        } else if (isCountryDanger) {
            zoneColor = '#ff0000';
            zoneLabel = 'DANGER ZONE [RESTRICTED AREA]';
        } else {
            zoneColor = '#ffff00'; // Other zones (Warning/Yellow)
            zoneLabel = 'CAUTION ZONE [UNVERIFIED]';
        }
        
        fields.find(f => f.id === 'res-security').value = zoneLabel;

        // Typing effect for system log feel
        fields.forEach((field, index) => {
            const el = document.getElementById(field.id);
            if (!el) return;
            el.textContent = '';
            if (field.id === 'res-security') el.style.color = zoneColor;
            setTimeout(() => {
                let i = 0;
                const text = field.value.toString();
                const type = () => {
                    if (i < text.length) {
                        el.textContent += text.charAt(i);
                        i++;
                        setTimeout(type, 15);
                    }
                };
                type();
            }, index * 150);
        });

        // Map Zone Overlays
        if (marker) map.removeLayer(marker);
        if (circle) map.removeLayer(circle);
        if (countryLayer) map.removeLayer(countryLayer);

        // Fetch Country Boundary for full-fill danger zone with a "hole" at the IP location
        try {
            const countryRes = await fetch(`https://nominatim.openstreetmap.org/search?country=${encodeURIComponent(data.country)}&format=geojson&polygon_geojson=1`);
            const countryGeo = await countryRes.json();
            
            if (countryGeo && countryGeo.features && countryGeo.features.length > 0) {
                // Create a "spotlight" effect by adding a small circle as a hole in the polygon
                // Leaflet geoJSON doesn't easily support dynamic holes in pre-fetched polygons, 
                // so we use a simpler approach: high contrast marker and a slight fade.
                
                countryLayer = L.geoJSON(countryGeo.features[0], {
                    style: {
                        color: '#ff0000',
                        weight: 2,
                        fillColor: '#ff0000',
                        fillOpacity: 0.4,
                        dashArray: '5, 10'
                    },
                    interactive: false
                }).addTo(map);
            }
        } catch (err) {
            console.error("Country boundary fetch failed:", err);
        }

        map.setView([lat, lng], 5);
        
        // Add a "Clear Sky" circle at the exact location to ensure clarity
        circle = L.circle([lat, lng], {
            color: '#ffffff',
            fillColor: '#000000', // Deep contrast
            fillOpacity: 0.1,
            radius: 5000, // Large enough to see street names
            weight: 2,
            dashArray: '5, 5',
            interactive: false
        }).addTo(map);

        // Add a smaller inner blinking ring
        const innerPulse = L.circle([lat, lng], {
            color: '#ffffff',
            fillColor: '#ffffff',
            fillOpacity: 0.2,
            radius: 1000,
            weight: 1,
            interactive: false
        }).addTo(map);

        const techIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `
                <div class="ripple"></div>
                <div class="location-pin-container">
                    <img src="red-pin.png" class="custom-logo-pin" alt="pin">
                    <div class="pin-shadow"></div>
                </div>
            `,
            iconSize: [60, 60],
            iconAnchor: [30, 60]
        });

        marker = L.marker([lat, lng], {icon: techIcon}).addTo(map);

        // Ensure UI is visible when a new result is found
        toggleUI(true);

        // Marker click logic: show UI (do not auto-open popup)
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            toggleUI(true);
        });

        // Sync radar pulse animation
        const radarPulse = document.querySelector('.pulse');
        if (radarPulse) {
            radarPulse.style.animation = 'none';
            void radarPulse.offsetWidth; // trigger reflow
            radarPulse.style.animation = 'pulse-ring 2s ease-out infinite';
        }

        resultDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');
    };

    const showLoading = () => {
        loadingDiv.classList.remove('hidden');
        resultDiv.classList.add('hidden');
        errorDiv.classList.add('hidden');
        
        // Dynamic loading subtext
        const subtexts = [
            'ESTABLISHING SECURE CONNECTION',
            'BYPASSING FIREWALLS',
            'ACCESSING GLOBAL SATELLITE NETWORK',
            'DECRYPTING COORDINATES',
            'RETRIEVING GEOSPATIAL DATA'
        ];
        let subIndex = 0;
        const subtextEl = document.getElementById('loading-subtext');
        
        const updateSubtext = () => {
            if (!loadingDiv.classList.contains('hidden')) {
                subtextEl.textContent = subtexts[subIndex];
                subIndex = (subIndex + 1) % subtexts.length;
                setTimeout(updateSubtext, 800);
            }
        };
        updateSubtext();
    };

    const hideLoading = () => {
        loadingDiv.classList.add('hidden');
        resultDiv.classList.remove('hidden'); // Ensure results are shown after loading
    };

    const showError = (msg) => {
        errorMsg.textContent = msg;
        errorDiv.classList.remove('hidden');
        resultDiv.classList.add('hidden');
    };

    traceBtn.addEventListener('click', () => {
        const ip = ipInput.value.trim();
        traceIP(ip);
    });

    ipInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const ip = ipInput.value.trim();
            traceIP(ip);
        }
    });

    // Auto trace own IP on load
    traceIP();

    // Custom Zoom Controls (Google Maps style incremental zoom)
    document.getElementById('zoom-in').addEventListener('click', () => {
        map.zoomIn(); 
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
        map.zoomOut();
    });

    // Locate Target Logic
    document.getElementById('locate-target').addEventListener('click', () => {
        if (marker) {
            map.setView(marker.getLatLng(), 15);
        }
    });

    // Mini-size Toggle Logic
    const terminalHeader = document.getElementById('terminal-header');
    const terminalOverlay = document.querySelector('.terminal-overlay');

    terminalHeader.addEventListener('click', () => {
        terminalOverlay.classList.toggle('minimized');
    });

    const toggleUI = (show) => {
        const radar = document.querySelector('.radar');
        const zoomControls = document.querySelector('.zoom-controls');
        const scanLine = document.querySelector('.scan-line');

        const opacity = show ? '1' : '0';
        const pointerEvents = show ? 'auto' : 'none';

        terminalOverlay.style.opacity = opacity;
        terminalOverlay.style.pointerEvents = pointerEvents;
        radar.style.opacity = opacity;
        zoomControls.style.opacity = opacity;
        scanLine.style.opacity = opacity;
    };

    // Map click logic: toggle between full and mini instead of hiding
    map.on('click', () => {
        if (!terminalOverlay.classList.contains('minimized')) {
            terminalOverlay.classList.add('minimized');
        } else {
            terminalOverlay.classList.remove('minimized');
        }
    });
});
