# Pose-Tracked AR Lab Scaffold

This project provides a reusable web-based scaffold for creating interactive, augmented reality (AR) educational labs. It uses a computer's webcam and **MediaPipe** to track the user's pose, hands, and face, anchoring an interactive "heads-up display" (HUD) to the user's body.

Users can interact with educational "Missions" using a hand-pinching gesture to perform drag-and-drop actions. A 2D fallback mode is also included for users without a camera or for standard desktop interaction.

## ✨ Features

* **MediaPipe Tracking:** Utilizes webcam input for real-time Pose, Hand, and Face Mesh detection.
* **AR "HUD" Interface:** Anchors the UI panel to the user's face (default) or torso, creating a body-locked AR experience.
* **Gesture Interaction:** Detects an "index-to-thumb" pinch gesture to "grab" and move UI elements.
* **Configurable Missions:** All content (missions, questions, cards) is loaded from a single JavaScript object (`WEEK_CONFIG`).
* **Dynamic Content Importer:** Allows users to paste a new JSON configuration at runtime to load different labs.
* **Interaction Logging:** Captures a detailed log of user actions (e.g., `drag_start`, `check_click`, `submit`) with timestamps.
* **Data Export:** Logs can be downloaded as `.jsonl` or `.csv` files for analysis.
* **2D Fallback:** Provides a "No-camera Mode" that centers the UI for standard mouse/trackpad interaction.

## 🚀 Getting Started

To run this project, you must serve the files from a web server. You cannot simply open the `index.html` file directly from your filesystem due to browser security policies for camera access (`getUserMedia`).

1.  Place `index.html`, `style.css`, and `script.js` in the same directory.
2.  Start a local web server in that directory. A simple way to do this if you have Python 3 is:
    ```sh
    python -m http.server
    ```
3.  Open your browser and navigate to `http://localhost:8000`.
4.  Click **"Start with Camera"** and grant camera permissions.

## 🛠️ How It Works

* **`index.html`**: Contains the HTML structure for the header, viewport, video/canvas elements, and all UI panels (Onboarding, Mission, Wrap-up). It links to `style.css` and `script.js`.
* **`style.css`**: Provides all styling for the application, including the panel, buttons, cards, bins, and the AR cursor.
* **`script.js`**: The core application logic.
    * **MediaPipe Loader**: Asynchronously loads the Pose, Hands, and Face Mesh models from a CDN.
    * **`frameLoop()`**: The main render loop that sends video frames to MediaPipe for analysis on every frame.
    * **Anchor Logic**: Calculates the screen position for the `#hud` element using CSS `transform`. It can be anchored to the user's face (using cheek landmarks) or torso (using shoulder landmarks) based on the dropdown selection.
    * **Interaction Logic**: Checks the distance between the detected index finger and thumb tips. If they are close enough, it triggers a "pinch" state, which allows the user to "grab" and move elements.
    * **Mission Engine**: A `WIDGETS` object contains `render()` and `score()` functions for different activity types (e.g., `cardBin`, `mcq`).
    * **State Management**: A global `state` object tracks the current mission, scores, and logs all events.

## 📝 Customizing Content

The entire lab's content is controlled by the `WEEK_CONFIG` object at the top of `script.js`. You can edit this object to create entirely new labs.

You can also use the **"Import Config (JSON)"** button in the app to paste a new configuration object at runtime.

### `WEEK_CONFIG` Schema

The configuration object follows this basic structure:

```javascript
let WEEK_CONFIG = {
  // 1. General Info
  week: 1,
  title: "Week 1 — Intro to Systems Analysis & SDLC",

  // 2. Mission Definitions
  missions: [
    {
      id: "A",
      title: "SDLC Phase Sort",
      type: "cardBin", // Widget type
      bins: ["Planning", "Analysis", "Design", "Implementation", "Maintenance"],
      cards: [
        { id: "c1", text: "Identify and select projects", bin: "Planning" },
        { id:D: "c2", text: "Define system requirements", bin: "Analysis" },
        // ... more cards
      ]
    },
    {
      id: "B",
      title: "Feasibility Triad + Lifecycle Model MCQ",
      type: "multi", // A mission with multiple widgets
      blocks: [
        {
          subtype: "triadBins", // A 3-column drag-and-drop
          bins: ["Economic", "Technical", "Operational"],
          cards: [
            { id: "f1", text: "ROI depends on...", bin: "Economic" },
            // ... more cards
          ]
        },
        {
          subtype: "mcq", // A multiple-choice question
          stem: "Which lifecycle best fits evolving requirements?",
          options: ["Waterfall", "Spiral", "Agile/Iterative"],
          answer: 2 // 0-indexed
        }
      ]
    }
    // ... more missions
  ]

### Supported Widget Types
* `"cardBin"`: A standard drag-and-drop sorting activity with multiple bins.
* `"triadBins"`: A 3-column variant of `cardBin`, useful for triads like (Economic, Technical, Operational).
* `"mcq"`: A standard multiple-choice question.
* `"order"`: A re-orderable list (this widget exists in the engine but is not used in the Week 1 example).
* `"multi"`: A container for multiple sub-widgets (like `triadBins` and `mcq`) on a single mission screen.

---
## 📊 Data Logging
The application logs all significant user interactions to the `state.events` array in memory. This data can be exported for analysis using the:

* **Download JSON** button (generates a `.jsonl` file, with one JSON object per event).
* **Download CSV** button.

This data is intended for research and analytics on student interaction patterns and performance.

  // 3. Scoring Weights
  weights: { A: 3.5, B: 3.0, C: 3.5 } // Points per mission
};
