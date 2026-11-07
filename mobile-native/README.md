# Weather API mobile app (React Native)

This Expo app is the native phone view. It reads the same `GET /api/readings` endpoint as the React web dashboard. The web dashboard remains in the project root; this app is a separate native target.

## Connect it to the sensor API

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_WEATHER_API_URL` to the computer running `server.py`:

- Physical phone on the same Wi-Fi: `http://<computer-LAN-IP>:8080/api/readings`
- Android emulator: `http://10.0.2.2:8080/api/readings`
- iOS simulator: `http://127.0.0.1:8080/api/readings`

The LAN IP in the URL must be reachable from the phone. Start the API server from the project root:

```powershell
py server.py --host 0.0.0.0 --port 8080
```

## Run the native app

```powershell
cd mobile-native
npm install
npm start
```

Scan the Expo QR code with Expo Go, or press `a` for an Android emulator / `i` for an iOS simulator. Expo Go on iOS requires macOS to run the iOS simulator.

The app polls every five seconds, supports pull-to-refresh, and marks sample values and API status clearly. It uses React Native's `Animated` API for the small native weather and refresh animations.
