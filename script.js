// HARMONY AI - Debug Version v1.2
const fileInput = document.getElementById('imageUpload');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const metricsDiv = document.getElementById('metrics');
const scorecard = document.getElementById('scorecard');
const loading = document.getElementById('loading');

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
    
    loading.style.display = 'block';
    scorecard.style.display = 'none';
    metricsDiv.innerHTML = ""; // Clear previous
    
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
    // Safety check for undefined points
    if(!A || !B || !C) return 0;
    
    const AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
    const BC = Math.sqrt(Math.pow(B.x - C.x, 2) + Math.pow(B.y - C.y, 2));
    const AC = Math.sqrt(Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2));
    
    // Avoid division by zero
    if (BC * AB === 0) return 0;

    // Cosine Rule
    let angleRad = Math.acos((BC*BC + AB*AB - AC*AC) / (2*BC*AB));
    return angleRad * (180 / Math.PI); // Convert to degrees
}

function getTierClass(tier) {
    if (!tier) return "tier-f";
    if (tier.includes("Tier S")) return "tier-s";
    if (tier.includes("Tier A")) return "tier-a";
    if (tier.includes("Tier B")) return "tier-b";
    return "tier-f";
}

// 4. THE BRAIN: Process the measurements
function onResults(results) {
  loading.style.display = 'none';
  scorecard.style.display = 'block';
  
  // Verify Landmarks exist
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      metricsDiv.innerHTML = "<span style='color:red'>No face detected. Please try a clearer photo.</span>";
      return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  // Draw the mesh
  try {
      // Check if global drawing variables exist
      if (window.drawConnectors && window.FACEMESH_TESSELATION) {
          drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: '#C0C0C040', lineWidth: 0.5});
      }
  } catch(e) {
      console.log("Drawing failed, skipping visual mesh");
  }

  try {
    // --- DECISION: IS IT SIDE OR FRONT? ---
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
    let html = "";
    
    // SIDE PROFILE CHECK
    if (faceWidth < 0.2 || nose.x < leftCheek.x || nose.x > rightCheek.x) {
        
        let profileSide = "Right";
        let earIdx = 132, jawIdx = 172, chinIdx = 152; 

        // Check look direction
        if (nose.x < 0.5) { 
            profileSide = "Left";
            earIdx = 361; jawIdx = 397; chinIdx = 152; 
        }

        const ear = landmarks[earIdx];
        const jaw = landmarks[jawIdx]; 
        const chin = landmarks[chinIdx];

        // 1. Gonial Angle
        let gonialAngle = calculateAngle(ear, jaw, chin);
        if (isNaN(gonialAngle)) gonialAngle = 0;
        
        let jawTier = "Tier F";
        if (gonialAngle >= 110 && gonialAngle <= 125) jawTier = "Tier S (Ideal)";
        else if (gonialAngle >= 105 && gonialAngle <= 130) jawTier = "Tier A";
        else if (gonialAngle > 90 && gonialAngle < 140) jawTier = "Tier B";

        html += `<h4>${profileSide} Profile Detected</h4>`;
        html += `<p><strong>Gonial Angle:</strong> ${gonialAngle.toFixed(1)}° <span class="${getTierClass(jawTier)}">[${jawTier}]</span></p>`;
        
        // 2. Ramus Ratio
        const ramus = getDistance(ear, jaw);
        const mandible = getDistance(jaw, chin);
        let ratio = ramus / mandible;
        if (isNaN(ratio) || !isFinite(ratio)) ratio = 0;
        
        let ratioTier = "Tier F";
        if (ratio >= 0.55 && ratio <= 0.80) ratioTier = "Tier S (Ideal)";
        else if (ratio >= 0.45 && ratio <= 0.90) ratioTier = "Tier A";

        html += `<p><strong>Ramus Ratio:</strong> ${ratio.toFixed(2)} <span class="${getTierClass(ratioTier)}">[${ratioTier}]</span></p>`;

    } else {
        // FRONT PROFILE CHECK
        html += `<h4>Front Profile Detected</h4>`;

        // 1. Canthal Tilt
        const outerEye = landmarks[33];
        const innerEye = landmarks[133];
        let tilt = (Math.atan2(outerEye.y - innerEye.y, outerEye.x - innerEye.x) * 180 / Math.PI) * -1;
        if (isNaN(tilt)) tilt = 0;
        
        let tiltTier = "Tier B";
        if (tilt >= 4 && tilt <= 10) tiltTier = "Tier S (Ideal)";
        else if (tilt > 0) tiltTier = "Tier A (Positive)";
        else tiltTier = "Tier F (Negative)";
        
        html += `<p><strong>Canthal Tilt:</strong> ${tilt.toFixed(1)}° <span class="${getTierClass(tiltTier)}">[${tiltTier}]</span></p>`;

        // 2. Eye Separation
        const innerDist = getDistance(landmarks[133], landmarks[362]);
        const cheekWidth = getDistance(landmarks[234], landmarks[454]);
        let esr = (innerDist / cheekWidth) * 100;
        if (isNaN(esr)) esr = 0;
        
        let esrTier = "Tier B";
        if (esr >= 45 && esr <= 47) esrTier = "Tier S (Ideal)";
        else if (esr >= 42 && esr <= 50) esrTier = "Tier A";
        
        html += `<p><strong>Eye Separation:</strong> ${esr.toFixed(1)}% <span class="${getTierClass(esrTier)}">[${esrTier}]</span></p>`;
    }

    metricsDiv.innerHTML = html;

  } catch (err) {
      console.error(err);
      metricsDiv.innerHTML = `<span style='color:red'>Calculation Error: ${err.message}</span>`;
  }
}
