// HARMONY AI - Main Logic
const fileInput = document.getElementById('imageUpload');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const metricsDiv = document.getElementById('metrics');

// 1. Setup MediaPipe FaceMesh
const faceMesh = new FaceMesh({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true, 
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// 2. Handle Image Upload
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = async () => {
    // Resize canvas to match image
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    document.getElementById('loading').style.display = 'block';
    document.getElementById('scorecard').style.display = 'none';
    
    // Run the AI
    await faceMesh.send({image: img});
  };
});

// 3. Geometry Math Helper Functions
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function calculateAngle(A, B, C) {
    // Calculates angle at point B (Vertex)
    const AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
    const BC = Math.sqrt(Math.pow(B.x - C.x, 2) + Math.pow(B.y - C.y, 2));
    const AC = Math.sqrt(Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2));
    // Cosine Rule
    let angleRad = Math.acos((BC*BC + AB*AB - AC*AC) / (2*BC*AB));
    return angleRad * (180 / Math.PI); // Convert to degrees
}

function getTierClass(tier) {
    if (tier.includes("Tier S")) return "tier-s";
    if (tier.includes("Tier A")) return "tier-a";
    if (tier.includes("Tier B")) return "tier-b";
    return "tier-f";
}

// 4. THE BRAIN: Process the measurements
function onResults(results) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('scorecard').style.display = 'block';
  
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];
    
    // Draw the aesthetic mesh
    drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: '#C0C0C040', lineWidth: 0.5});

    // --- DECISION: IS IT SIDE OR FRONT? ---
    // We check the nose position relative to the cheeks (Z-depth or X-width)
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    
    // Calculate Face Width on screen
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
    
    let html = "";
    
    // If face is very narrow or nose is far to side, it's a SIDE PROFILE
    if (faceWidth < 0.3 || nose.x < leftCheek.x || nose.x > rightCheek.x) {
        
        // --- SIDE PROFILE LOGIC ---
        let profileSide = "Right";
        let earIdx = 132, jawIdx = 172, chinIdx = 152; // Default Right

        // If nose is on the left side of screen, user is looking Left
        if (nose.x < 0.5) { 
            profileSide = "Left";
            earIdx = 361; jawIdx = 397; chinIdx = 152; 
        }

        const ear = landmarks[earIdx];
        const jaw = landmarks[jawIdx]; 
        const chin = landmarks[chinIdx];

        // 1. Gonial Angle
        const gonialAngle = calculateAngle(ear, jaw, chin);
        
        [cite_start]// Scoring [cite: 2]
        let jawTier = "Tier F";
        if (gonialAngle >= 112 && gonialAngle <= 123) jawTier = "Tier S (Ideal)";
        else if (gonialAngle >= 109 && gonialAngle <= 128) jawTier = "Tier A";
        else if (gonialAngle >= 105 && gonialAngle <= 135) jawTier = "Tier B";

        html += `<h4>${profileSide} Profile Detected</h4>`;
        html += `<p><strong>Gonial Angle:</strong> ${gonialAngle.toFixed(1)}° <span class="${getTierClass(jawTier)}">[${jawTier}]</span></p>`;
        
        // 2. Ramus/Mandible Ratio
        const ramus = getDistance(ear, jaw);
        const mandible = getDistance(jaw, chin);
        const ratio = ramus / mandible;
        
        [cite_start]// Scoring [cite: 2]
        let ratioTier = "Tier F";
        if (ratio >= 0.59 && ratio <= 0.78) ratioTier = "Tier S (Ideal)";
        else if (ratio >= 0.50 && ratio <= 0.85) ratioTier = "Tier A";

        html += `<p><strong>Ramus Ratio:</strong> ${ratio.toFixed(2)} <span class="${getTierClass(ratioTier)}">[${ratioTier}]</span></p>`;

    } else {
        
        // --- FRONT PROFILE LOGIC ---
        html += `<h4>Front Profile Detected</h4>`;

        // 1. Canthal Tilt
        // Angle between inner eye corner (133) and outer (33)
        const outerEye = landmarks[33];
        const innerEye = landmarks[133];
        const tilt = (Math.atan2(outerEye.y - innerEye.y, outerEye.x - innerEye.x) * 180 / Math.PI) * -1;
        
        [cite_start]// Scoring [cite: 8]
        let tiltTier = "Tier B";
        if (tilt >= 5.2 && tilt <= 8.5) tiltTier = "Tier S (Ideal)";
        else if (tilt > 0) tiltTier = "Tier A (Positive)";
        else tiltTier = "Tier F (Negative)";
        
        html += `<p><strong>Canthal Tilt:</strong> ${tilt.toFixed(1)}° <span class="${getTierClass(tiltTier)}">[${tiltTier}]</span></p>`;

        // 2. Eye Separation Ratio
        // (Inner Distance / Face Width) * 100
        const innerDist = getDistance(landmarks[133], landmarks[362]);
        const cheekWidth = getDistance(landmarks[234], landmarks[454]);
        const esr = (innerDist / cheekWidth) * 100;
        
        [cite_start]// Scoring [cite: 7]
        let esrTier = "Tier B";
        if (esr >= 44.3 && esr <= 47.7) esrTier = "Tier S (Ideal)";
        else if (esr >= 41 && esr <= 51) esrTier = "Tier A";
        
        html += `<p><strong>Eye Separation:</strong> ${esr.toFixed(1)}% <span class="${getTierClass(esrTier)}">[${esrTier}]</span></p>`;
    }

    metricsDiv.innerHTML = html;
  }
}
